from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.domain.constants import ASSESSMENT_STATUS_COMPLETED
from app.repositories.assessment_answer_repository import AssessmentAnswerRepository
from app.repositories.assessment_repository import AssessmentRepository
from app.repositories.capability_repository import CapabilityRepository
from app.schemas.final_report import FinalReportResponse
from app.schemas.recommendations import (
    AssessmentRecommendationsResponse,
    AssessmentTraceResponse,
    BatchRecommendationGenerateResponse,
    RecommendationOutputsResponse,
)
from sqlalchemy import select
from app.db.models.interview_guide import InterviewGuide
from app.schemas.interview_guide import (
    InterviewGuideResponse,
    InterviewGuideQuestionItem,
    GenerateInterviewGuideRequest,
    SaveInterviewGuideRequest,
)
from app.services.assessment.reporting.benchmark_service import BenchmarkService
from app.services.assessment.reporting.recommendation_service import RecommendationService
from app.services.assessment.reporting.final_report_service import ReportBuilderService
from app.services.assessment.reporting.trace_service import AssessmentTraceService
from app.services.assessment.scoring.scoring_service import (
    AssessmentScoringService,
    build_assessment_scoring_service,
)
from app.services.llm.core.facade_service import LLMService, build_llm_service
from app.services.platform import AsyncUnitOfWork


class AssessmentReportingService:
    """Compatibility facade delegating to reporting sub-services."""

    def __init__(
        self,
        trace_service: AssessmentTraceService,
        recommendation_service: RecommendationService,
        report_builder_service: ReportBuilderService,
    ) -> None:
        self.trace = trace_service
        self.recommendations = recommendation_service
        self.report_builder = report_builder_service

    async def get_trace(self, assessment_id: int, limit: int = 500, offset: int = 0) -> AssessmentTraceResponse | None:
        return await self.trace.get_trace(assessment_id=assessment_id, limit=limit, offset=offset)

    async def get_recommendations(self, assessment_id: int) -> AssessmentRecommendationsResponse | None:
        return await self.recommendations.get_recommendations(assessment_id=assessment_id)

    async def generate_recommendations_batch(
        self,
        assessment_id: int,
        language: str = "en",
        max_actions_per_capability: int | None = None,
        tone: str = "practical",
        max_words_per_capability: int | None = None,
    ) -> BatchRecommendationGenerateResponse | None:
        return await self.recommendations.generate_recommendations_batch(
            assessment_id=assessment_id,
            language=language,
            max_actions_per_capability=max_actions_per_capability,
            tone=tone,
            max_words_per_capability=max_words_per_capability,
        )

    async def get_recommendation_outputs(self, assessment_id: int) -> RecommendationOutputsResponse | None:
        return await self.recommendations.get_recommendation_outputs(assessment_id=assessment_id)

    async def get_final_report(
        self,
        assessment_id: int,
        refresh_synthesis: bool = False,
    ) -> FinalReportResponse | None:
        assessment = await self._prepare_completed_report_artifacts(assessment_id)
        if assessment is None:
            return None
        return await self.report_builder.get_final_report(
            assessment_id=assessment_id,
            refresh_synthesis=refresh_synthesis,
        )

    async def _prepare_completed_report_artifacts(self, assessment_id: int) -> Any | None:
        assessment = await self.report_builder.assessments.get_by_id(assessment_id)
        if assessment is None:
            return None
        if str(getattr(assessment, "status", "")) != ASSESSMENT_STATUS_COMPLETED:
            return assessment

        outputs = await self.recommendations.get_recommendation_outputs(assessment_id=assessment_id)
        if (
            outputs is None
            or not outputs.items
            or getattr(assessment, "overall_maturity_level_id", None) is None
            or not getattr(assessment, "overall_maturity_band", None)
        ):
            await self.recommendations.finalize_completed_assessment(
                assessment_id=assessment_id,
                assessment=assessment,
            )

        await self.report_builder.prepare_leaders_snapshot_generation(
            assessment_id=assessment_id,
            assessment=assessment,
        )
        return assessment

    async def _call_moonshot(self, messages: list[dict[str, str]]) -> str:
        import httpx
        from app.core.config import get_settings
        
        settings = get_settings()
        api_key = settings.moonshot_api_key
        model = settings.moonshot_model
        base_url = settings.moonshot_base_url
        
        url = base_url.rstrip("/") + "/chat/completions"
        payload = {
            "model": model,
            "temperature": 1.0,
            "messages": messages,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        timeout_val = settings.llm_request_timeout_seconds
        async with httpx.AsyncClient(timeout=timeout_val) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def get_interview_guide(self, req: GenerateInterviewGuideRequest) -> InterviewGuideResponse | None:
        assessment = None
        if req.assessment_id is not None:
            assessment = await self.report_builder.assessments.get_by_id(req.assessment_id)
        
        # 1. Fetch chat history trace and structured assessment scores (if assessment exists)
        history_text = ""
        trace_data = None
        assessed_capabilities_text = ""
        gaps_text = ""

        if req.assessment_id is not None and assessment is not None:
            trace_data = await self.trace.get_trace(assessment_id=req.assessment_id)
            try:
                capabilities_list = await self.report_builder.capabilities.list_all_for_assessment(req.assessment_id)
                assessed_lines = []
                gap_lines = []
                for item in capabilities_list:
                    axis = item.get("axis", "")
                    code = item.get("code", "")
                    label = item.get("label", "")
                    status = item.get("assessment_status", "not_assessed")
                    level = item.get("maturity_level_id")
                    rationale = item.get("rationale") or ""
                    
                    if status == "assessed" and level is not None:
                        assessed_lines.append(
                            f"- [{axis.upper()}] {code}: {label} - Assessed Level {level}\n"
                            f"  Justification/Evidence: {rationale}"
                        )
                    else:
                        gap_lines.append(f"- [{axis.upper()}] {code}: {label} ({status.replace('_', ' ')})")
                
                if assessed_lines:
                    assessed_capabilities_text = "\n".join(assessed_lines)
                if gap_lines:
                    gaps_text = "\n".join(gap_lines)
            except Exception as e:
                # Log or ignore error during score loading
                pass
            
        if trace_data and trace_data.items:
            history_lines = []
            for item in trace_data.items:
                history_lines.append(f"Orion Bot: {item.question}")
                history_lines.append(f"Client: {item.answer}")
            history_text = "\n".join(history_lines)
            
        # 2. Resolve parameters (use request parameters, falling back to assessment details if linked)
        company_name = req.company_name
        sector = req.sector or "N/A"
        size = req.size or "N/A"
        region = req.region or "N/A"
        language = req.language
        profile = req.profile
        
        if assessment is not None:
            if not req.company_name:
                company_name = getattr(assessment.company, "name", "Client")
            sector = req.sector or getattr(getattr(assessment.company, "sector", None), "name", "N/A")
            size = req.size or getattr(getattr(assessment.company, "company_size", None), "label", "N/A")
            region = req.region or getattr(getattr(assessment.company, "region_ref", None), "name", "N/A")
            
        # 3. Compile prompts
        from app.services.llm.prompts.templates import build_interview_guide_prompt, language_directive
        from app.services.llm.utils import extract_json
        
        custom_profile_desc = req.custom_profile_description
        system_content = build_interview_guide_prompt(profile, language, custom_profile_desc) + language_directive(language)
        
        user_content = (
            f"Company Name: {company_name}\n"
            f"Sector: {sector}\n"
            f"Size: {size}\n"
            f"Region: {region}\n"
            f"Language: {language}\n"
            f"Target Stakeholder Profile: {profile}\n"
        )
        
        if req.custom_profile_description:
            user_content += f"Target Stakeholder Custom Specifications: {req.custom_profile_description}\n"
            
        if req.custom_context:
            user_content += f"Consultant Custom Context/Focus: {req.custom_context}\n"
            
        if assessed_capabilities_text:
            user_content += f"\nAssessed Capabilities & Maturity Levels:\n{assessed_capabilities_text}\n"
            
        if gaps_text:
            user_content += f"\nUnassessed Capabilities / Gaps:\n{gaps_text}\n"

        if history_text:
            user_content += f"\nConversation History with Orion Bot:\n{history_text}\n"
        else:
            user_content += "\nNo prior conversation history exists. Generate the guide from scratch based on the company profile and custom context.\n"
            
        user_content += "\nGenerate the structured Client Interview Guide JSON:"
        
        messages = [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content}
        ]
        
        # 4. Trigger LLM
        import logging
        try:
            raw_response = await self._call_moonshot(messages)
        except Exception as e:
            import logging
            import traceback
            logging.getLogger(__name__).warning(
                f"Kimi/Moonshot API call failed: {e}.\n"
                f"Traceback:\n{traceback.format_exc()}\n"
                f"Falling back to default Mistral gateway."
            )
            raw_response = await self.report_builder.llm.gateway.chat_messages(messages)
        
        # 5. Parse JSON
        try:
            parsed_json = extract_json(raw_response)
            
            def parse_q_items(items_list):
                q_items = []
                if not items_list or not isinstance(items_list, list):
                    return q_items
                for q in items_list:
                    q_text = q.get("question", q.get("question_text", ""))
                    q_rationale = q.get("rationale", q.get("reason", q.get("why", "")))
                    q_followup = q.get("follow_up", q.get("followup", ""))
                    
                    # Safely convert and format fields to string
                    q_text = str(q_text).strip() if q_text is not None else ""
                    q_rationale = str(q_rationale).strip() if q_rationale is not None else ""
                    
                    if isinstance(q_followup, list):
                        q_followup = "\n".join(f"- {str(item).strip()}" for item in q_followup if item)
                    else:
                        q_followup = str(q_followup).strip() if q_followup is not None else ""
                        
                    if q_text:
                        q_items.append(
                            InterviewGuideQuestionItem(
                                question=q_text,
                                rationale=q_rationale,
                                follow_up=q_followup
                            )
                        )
                return q_items

            intro_qs = parse_q_items(parsed_json.get("introduction_questions", []))
            manage_qs = parse_q_items(parsed_json.get("manage_questions", []))
            analyze_qs = parse_q_items(parsed_json.get("analyze_questions", []))
            improve_qs = parse_q_items(parsed_json.get("improve_questions", []))
            closure_qs = parse_q_items(parsed_json.get("closure_questions", []))
            
            return InterviewGuideResponse(
                assessment_id=req.assessment_id,
                company_name=company_name,
                language=language,
                executive_summary=parsed_json.get("executive_summary", ""),
                unanswered_areas=parsed_json.get("unanswered_areas", []),
                introduction_questions=intro_qs,
                manage_questions=manage_qs,
                analyze_questions=analyze_qs,
                improve_questions=improve_qs,
                closure_questions=closure_qs
            )
        except Exception as e:
            import logging
            from fastapi import HTTPException
            logging.getLogger(__name__).error(f"Error generating interview guide: {e}. Raw response: {raw_response}")
            raise HTTPException(
                status_code=502,
                detail="Échec de la génération ou de la validation du guide d'entretien. Veuillez réessayer." if language.lower().startswith("fr") else "Failed to generate or validate the interview guide. Please try again."
            )

    async def debug_competitive_first_layer(
        self,
        assessment_id: int,
        competitor_name: str | None = None,
    ) -> dict[str, Any] | None:
        return await self.report_builder.debug_competitive_first_layer(
            assessment_id=assessment_id,
            competitor_name=competitor_name,
        )

    async def debug_telecom_semantic_leaders(self, assessment_id: int) -> dict[str, Any] | None:
        return await self.report_builder.debug_telecom_semantic_leaders(assessment_id=assessment_id)

    async def debug_telecom_discovery_leaders(self, assessment_id: int) -> dict[str, Any] | None:
        return await self.report_builder.debug_telecom_discovery_leaders(assessment_id=assessment_id)

    async def finalize_completed_assessment(self, assessment_id: int, assessment: Any) -> None:
        await self.recommendations.finalize_completed_assessment(
            assessment_id=assessment_id,
            assessment=assessment,
        )
        await self.report_builder.prepare_leaders_snapshot_generation(
            assessment_id=assessment_id,
            assessment=assessment,
        )

    async def save_interview_guide(self, req: SaveInterviewGuideRequest) -> dict[str, Any]:
        session = self.report_builder.db
        from datetime import datetime

        # Check if an existing guide exists by ID or by company_name + profile
        guide = None
        if req.id:
            result = await session.execute(
                select(InterviewGuide).where(InterviewGuide.id == req.id)
            )
            guide = result.scalar_one_or_none()
        
        if not guide:
            # Look up by company_name and profile
            result = await session.execute(
                select(InterviewGuide).where(
                    InterviewGuide.company_name == req.company_name,
                    InterviewGuide.profile == req.profile
                )
            )
            guide = result.scalar_one_or_none()

        if guide:
            # Update
            guide.assessment_id = req.assessment_id
            guide.company_name = req.company_name
            guide.profile = req.profile
            guide.language = req.language
            guide.payload = req.payload
            guide.updated_at = datetime.utcnow()
        else:
            # Insert new
            guide = InterviewGuide(
                assessment_id=req.assessment_id,
                company_name=req.company_name,
                profile=req.profile,
                language=req.language,
                payload=req.payload
            )
            session.add(guide)

        await session.commit()
        return {"status": "success", "id": guide.id}

    async def list_interview_guides(self) -> list[InterviewGuide]:
        session = self.report_builder.db
        result = await session.execute(
            select(InterviewGuide).order_by(InterviewGuide.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_saved_interview_guide(self, guide_id: int) -> InterviewGuide | None:
        session = self.report_builder.db
        result = await session.execute(
            select(InterviewGuide).where(InterviewGuide.id == guide_id)
        )
        return result.scalar_one_or_none()


def build_assessment_reporting_service(
    db: AsyncSession,
    llm_service: LLMService | None = None,
    benchmark_service: BenchmarkService | None = None,
    scoring_service: AssessmentScoringService | None = None,
    settings: Settings | None = None,
) -> AssessmentReportingService:
    settings = settings or get_settings()
    assessments = AssessmentRepository(db)
    answers = AssessmentAnswerRepository(db)
    capabilities = CapabilityRepository(db)
    llm = llm_service or build_llm_service(settings=settings)
    benchmarks = benchmark_service or BenchmarkService(db=db)
    uow = AsyncUnitOfWork(db)
    scoring = scoring_service or build_assessment_scoring_service(
        db,
        assessments=assessments,
        capabilities=capabilities,
        settings=settings,
    )

    trace_service = AssessmentTraceService(
        assessments=assessments,
        answers=answers,
    )
    recommendation_service = RecommendationService(
        db=db,
        assessments=assessments,
        capabilities=capabilities,
        llm_service=llm,
        scoring_service=scoring,
        uow=uow,
        settings=settings,
    )
    report_builder = ReportBuilderService(
        db=db,
        assessments=assessments,
        capabilities=capabilities,
        llm_service=llm,
        benchmark_service=benchmarks,
        scoring_service=scoring,
        uow=uow,
        settings=settings,
    )
    return AssessmentReportingService(
        trace_service=trace_service,
        recommendation_service=recommendation_service,
        report_builder_service=report_builder,
    )
