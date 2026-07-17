"""Social-media scraping service powered by Apify and Bright Data."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone

import httpx
import os

from app.schemas.scraping import (
    PlatformResult,
    ScrapedReview,
    ScrapingResponse,
)
from app.services.scraping.classification_service import classify_reviews

logger = logging.getLogger(__name__)

_APIFY_BASE = "https://api.apify.com/v2"
_RUN_TIMEOUT = 480  # 8 minutes timeout for Apify actor runs to prevent premature timeout
_HTTP_TIMEOUT = 500.0  # httpx timeout (must exceed _RUN_TIMEOUT)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _save_raw_data(platform: str, brand: str, items: list[dict]):
    """Safely archive raw scraped data to a local JSON file."""
    try:
        os.makedirs("scraped_data", exist_ok=True)
        safe_brand = re.sub(r"[^a-zA-Z0-9_-]", "_", brand.strip().lower())
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"scraped_data/{safe_brand}_{platform.lower().replace(' ', '_')}_{timestamp}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
        logger.info("Saved raw scraped data for %s on %s to %s", brand, platform, filename)
    except Exception as e:
        logger.warning("Failed to save raw scraped data for %s on %s: %s", brand, platform, e)


async def _run_actor(
    client: httpx.AsyncClient,
    actor_id: str,
    token: str,
    run_input: dict,
    *,
    memory_mb: int = 2048,
    timeout: int = _RUN_TIMEOUT,
) -> list[dict]:
    """Run an Apify actor asynchronously and poll for results to prevent gateway timeouts."""
    # Start the run
    start_url = f"{_APIFY_BASE}/acts/{actor_id}/runs?token={token}&memory={memory_mb}"
    start_resp = await client.post(start_url, json=run_input)
    start_resp.raise_for_status()
    run_data = start_resp.json().get("data", {})
    run_id = run_data.get("id")
    dataset_id = run_data.get("defaultDatasetId")
    
    if not run_id or not dataset_id:
        raise ValueError(f"Failed to start actor run for {actor_id}")

    # Poll status
    status_url = f"{_APIFY_BASE}/actor-runs/{run_id}?token={token}"
    start_time = datetime.now(timezone.utc)
    
    while (datetime.now(timezone.utc) - start_time).total_seconds() < timeout:
        status_resp = await client.get(status_url)
        status_resp.raise_for_status()
        run_status = status_resp.json().get("data", {}).get("status")
        
        if run_status == "SUCCEEDED":
            items_url = f"{_APIFY_BASE}/datasets/{dataset_id}/items?token={token}"
            items_resp = await client.get(items_url)
            items_resp.raise_for_status()
            return items_resp.json()
        elif run_status in ["FAILED", "TIMED-OUT", "ABORTED"]:
            raise RuntimeError(f"Actor run {run_id} finished with status: {run_status}")
            
        await asyncio.sleep(4)
        
    raise TimeoutError(f"Actor run {run_id} timed out after {timeout} seconds")


def _parse_brightdata_response(content_bytes: bytes) -> list[dict]:
    """Parse Bright Data response which can be standard JSON or JSON Lines (NDJSON)."""
    text = content_bytes.decode("utf-8").strip()
    if not text:
        return []
    
    # Try parsing as JSON Lines (NDJSON)
    lines = text.splitlines()
    if len(lines) > 1 or (lines and lines[0].startswith("{") and lines[0].endswith("}")):
        try:
            return [json.loads(line) for line in lines if line.strip()]
        except Exception:
            pass
            
    # Fallback to standard JSON
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return [data]
    except Exception:
        pass
        
    raise ValueError(f"Failed to parse Bright Data response: {text[:200]}")


async def _run_brightdata_dataset(
    client: httpx.AsyncClient,
    dataset_id: str,
    bearer_token: str,
    inputs: list[dict],
) -> list[dict]:
    """Trigger a Bright Data dataset scrape and return the results."""
    url = f"https://api.brightdata.com/datasets/v3/scrape?dataset_id={dataset_id}&notify=false&include_errors=true"
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "input": inputs,
        "limit_per_input": None,
    }
    
    logger.info("Triggering Bright Data dataset scrape for ID: %s", dataset_id)
    resp = await client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    
    parsed = _parse_brightdata_response(resp.content)
    
    # If the response is a metadata dict with snapshot_id, we poll
    if len(parsed) == 1 and "snapshot_id" in parsed[0]:
        snapshot_id = parsed[0]["snapshot_id"]
        logger.info("Bright Data async snapshot created: %s. Polling...", snapshot_id)
        
        progress_url = f"https://api.brightdata.com/datasets/v3/progress/{snapshot_id}"
        snapshot_url = f"https://api.brightdata.com/datasets/v3/snapshot/{snapshot_id}"
        
        start_time = datetime.now(timezone.utc)
        while (datetime.now(timezone.utc) - start_time).total_seconds() < 180:
            p_resp = await client.get(progress_url, headers={"Authorization": f"Bearer {bearer_token}"})
            p_resp.raise_for_status()
            status = p_resp.json().get("status")
            logger.info("Bright Data snapshot %s status: %s", snapshot_id, status)
            
            if status == "ready":
                d_resp = await client.get(snapshot_url, headers={"Authorization": f"Bearer {bearer_token}"})
                d_resp.raise_for_status()
                return _parse_brightdata_response(d_resp.content)
            elif status in ["failed", "cancelled"]:
                raise RuntimeError(f"Bright Data dataset run failed: {status}")
                
            await asyncio.sleep(5)
            
        raise TimeoutError(f"Bright Data snapshot {snapshot_id} timed out")
        
    return parsed


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except Exception:
        if isinstance(val, str):
            m = re.search(r"[-+]?\d*\.\d+|\d+", val)
            if m:
                try:
                    return float(m.group(0))
                except Exception:
                    pass
        return None


def _brand_matches(text: str, brand: str) -> bool:
    """Return True if the text mentions the brand (case-insensitive, partial)."""
    if not text:
        return False
    parts = brand.lower().split()
    text_lower = text.lower()
    return any(p in text_lower for p in parts if len(p) > 2)


def _is_relevant_comment(text: str) -> bool:
    """Return True if the text seems to be a relevant customer comment/feedback rather than spam or tags."""
    if not text:
        return False
    text_clean = text.strip()
    # Check length: if less than 12 characters, probably just "up", "mrc", "top", or an emoji
    if len(text_clean) < 12:
        return False
    # Check if it is just a user tag (e.g. "@Name Name")
    if text_clean.startswith("@"):
        return False
    # If the text has only name-like patterns (e.g. 2-3 capitalized words) and nothing else, ignore
    words = text_clean.split()
    if len(words) <= 3 and all(w[0].isupper() for w in words if w and w[0].isalpha()):
        return False
    return True


def _format_date_val(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        try:
            # Check if millisecond timestamp
            if val > 1e11:
                val = val / 1000.0
            dt = datetime.fromtimestamp(val, tz=timezone.utc)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return str(val)
    if isinstance(val, str):
        val_strip = val.strip()
        if val_strip.isdigit():
            try:
                numeric_val = float(val_strip)
                if numeric_val > 1e11:
                    numeric_val = numeric_val / 1000.0
                dt = datetime.fromtimestamp(numeric_val, tz=timezone.utc)
                return dt.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass
        return val_strip
    return str(val)


# ---------------------------------------------------------------------------
# Google Maps Reviews
# ---------------------------------------------------------------------------

async def _scrape_google_maps(
    client: httpx.AsyncClient, brand: str, token: str,
) -> PlatformResult:
    """Scrape Google Maps reviews for the given brand."""
    try:
        items = await _run_actor(
            client,
            "compass~google-maps-reviews-scraper",
            token,
            {
                "startUrls": [],
                "searchStringsArray": [brand],
                "maxReviews": 40,
                "language": "fr",
                "personalData": True,
            },
            memory_mb=2048,
        )
        _save_raw_data("Google Maps", brand, items)

        reviews: list[ScrapedReview] = []
        for item in items:
            text = (item.get("text") or item.get("textTranslated") or "").strip()
            if not text:
                continue
            reviews.append(
                ScrapedReview(
                    platform="Google Maps",
                    author=item.get("name") or item.get("reviewerName"),
                    text=text,
                    rating=_safe_float(item.get("stars") or item.get("reviewRating")),
                    date=_format_date_val(item.get("publishedAtDate") or item.get("reviewDate")),
                    url=item.get("reviewUrl") or item.get("url"),
                )
            )

        if not reviews:
            return PlatformResult(platform="Google Maps", status="empty")

        return PlatformResult(
            platform="Google Maps",
            status="success",
            review_count=len(reviews),
            reviews=reviews,
        )
    except (RuntimeError, TimeoutError) as exc:
        logger.error("Google Maps scraping failed for '%s': %s", brand, exc)
        return PlatformResult(
            platform="Google Maps",
            status="error",
            error_message=str(exc)[:300],
        )
    except Exception as exc:
        logger.exception("Google Maps scraping failed for '%s' with unexpected error", brand)
        return PlatformResult(
            platform="Google Maps",
            status="error",
            error_message=str(exc)[:300],
        )


# ---------------------------------------------------------------------------
# Facebook
# ---------------------------------------------------------------------------

def _resolve_facebook_url(brand: str) -> str:
    brand_clean = brand.strip()
    if brand_clean.startswith("http://") or brand_clean.startswith("https://"):
        return brand_clean
    if "facebook.com/" in brand_clean.lower():
        if not brand_clean.lower().startswith("http"):
            return f"https://{brand_clean}"
        return brand_clean
    # Remove characters that are not alphanumeric or hyphens/dots
    clean_handle = re.sub(r"[^a-zA-Z0-9.-]", "", brand_clean)
    return f"https://www.facebook.com/{clean_handle}/"


async def _scrape_facebook(
    client: httpx.AsyncClient, brand: str, token: str, facebook_url: str | None = None
) -> PlatformResult:
    """Scrape Facebook comments from the latest posts of the brand's page using Bright Data."""
    try:
        page_url = facebook_url or _resolve_facebook_url(brand)
        if not page_url or "facebook.com/" not in page_url.lower():
            return PlatformResult(platform="Facebook", status="empty")

        logger.info("Resolving Facebook posts via Bright Data for page: %s", page_url)
        
        # Bright Data Auth Token and Dataset IDs
        bd_token = "bf384e33-b646-4045-b03e-96b2f28d7e12"
        posts_dataset_id = "gd_lkaxegm826bjpoo9m5"
        comments_dataset_id = "gd_lkay758p1eanlolqw8"
        
        # Step 1: Fetch latest posts
        posts_inputs = [{
            "url": page_url,
            "num_of_posts": 3
        }]
        
        try:
            posts = await _run_brightdata_dataset(client, posts_dataset_id, bd_token, posts_inputs)
        except httpx.HTTPStatusError as http_err:
            body_text = http_err.response.text
            if "Customer is not active" in body_text:
                return PlatformResult(
                    platform="Facebook",
                    status="error",
                    error_message="Bright Data API error: Customer is not active. Please fund/activate your account.",
                )
            raise http_err

        # Extract post URLs containing "/posts/" or post identifier "pfbid"
        post_urls = [p.get("url") for p in posts if p.get("url") and ("/posts/" in p.get("url") or "pfbid" in p.get("url"))]
        
        if not post_urls:
            logger.warning("No public post URLs resolved for Facebook page: %s", page_url)
            return PlatformResult(platform="Facebook", status="empty")

        logger.info("Scraping Facebook comments from %d posts...", len(post_urls))
        
        # Step 2: Fetch comments for resolved posts
        comments_inputs = [{"url": purl, "limit_records": 10} for purl in post_urls]
        comments = await _run_brightdata_dataset(client, comments_dataset_id, bd_token, comments_inputs)
        _save_raw_data("Facebook", brand, comments)

        reviews: list[ScrapedReview] = []
        for item in comments:
            if "error" in item:
                err_msg = item.get("error") or ""
                if "no comments" in err_msg.lower():
                    logger.info("Bright Data post has no comments: %s", item.get("input", {}).get("url"))
                else:
                    logger.warning("Bright Data comment item error: %s", err_msg)
                continue
                
            text = (item.get("comment_text") or "").strip()
            if not _is_relevant_comment(text):
                continue
            
            author = item.get("user_name") or "Anonymous"
            reviews.append(
                ScrapedReview(
                    platform="Facebook",
                    author=author,
                    text=text,
                    date=_format_date_val(item.get("date_created") or item.get("timestamp")),
                    url=item.get("comment_link") or item.get("post_url"),
                )
            )

        if not reviews:
            return PlatformResult(platform="Facebook", status="empty")

        return PlatformResult(
            platform="Facebook",
            status="success",
            review_count=len(reviews),
            reviews=reviews,
        )
    except (RuntimeError, TimeoutError) as exc:
        logger.error("Bright Data Facebook comments scraping failed for '%s': %s", brand, exc)
        return PlatformResult(
            platform="Facebook",
            status="error",
            error_message=str(exc)[:300],
        )
    except Exception as exc:
        logger.exception("Bright Data Facebook comments scraping failed for '%s' with unexpected error", brand)
        return PlatformResult(
            platform="Facebook",
            status="error",
            error_message=str(exc)[:300],
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_full_scrape(brand_name: str, apify_token: str, facebook_url: str | None = None) -> ScrapingResponse:
    """Run all scrapers concurrently and return a unified result."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(_HTTP_TIMEOUT)) as client:
        # We run gather with return_exceptions=True to ensure that one failure doesn't crash the entire pipeline
        results = await asyncio.gather(
            _scrape_google_maps(client, brand_name, apify_token),
            _scrape_facebook(client, brand_name, apify_token, facebook_url),
            return_exceptions=True
        )

    # Process results, checking for exceptions
    platforms = []
    platform_names = ["Google Maps", "Facebook"]
    for res, platform_name in zip(results, platform_names):
        if isinstance(res, Exception):
            logger.error("%s scraping raised exception: %s", platform_name, res, exc_info=True)
            platforms.append(
                PlatformResult(
                    platform=platform_name,
                    status="error",
                    error_message=f"System exception: {str(res)[:100]}",
                )
            )
        else:
            platforms.append(res)

    total = sum(p.review_count for p in platforms)

    # Classify successfully scraped reviews in a batch
    all_reviews = []
    for p in platforms:
        if p.status == "success" and p.reviews:
            all_reviews.extend(p.reviews)

    analysis = None
    if all_reviews:
        try:
            _, analysis = await classify_reviews(all_reviews, brand_name)
        except Exception:
            logger.exception("Failed to classify reviews for '%s'", brand_name)

    return ScrapingResponse(
        brand_name=brand_name,
        scraped_at=datetime.now(timezone.utc).isoformat(),
        platforms=platforms,
        total_reviews=total,
        analysis=analysis,
    )
