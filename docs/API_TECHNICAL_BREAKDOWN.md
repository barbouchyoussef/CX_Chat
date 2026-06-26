# Détails Techniques - Décomposition des Appels API

## 🔬 Anatomie d'un Assessment Complet

### Flux standard d'un assessment (utilisateur remplit le questionnaire)

```
UTILISATEUR REMPLIT LE QUESTIONNAIRE
        ↓
1. Intent Routing (Mistral)
   └─ "L'utilisateur veut continuer ou cherche de l'aide ?"
        ↓
2. Coverage Detection (Mistral) 
   └─ "Avons-nous assez d'evidence sur cette question ?"
        ↓
3. Semantic Leaders Fetch (Langsearch)
   └─ Pour chaque pain point, chercher 3-4 compétiteurs leaders
        ↓
4. Recommendations Generator (Mistral)
   └─ "Générer recommandations intelligentes"
        ↓
5. Report Synthesis (Mistral)
   └─ "Créer rapport récapitulatif"
        ↓
RAPPORT FINAL
```

---

## 🔢 Décomposition Détaillée des Appels

### **LANGSEARCH CALLS** (Web Search + Reranking)

#### Configuration par défaut:
```python
benchmark_max_candidates_initial = 4       # Nombre de compétiteurs à évaluer
benchmark_max_langsearch_docs_per_candidate = 8  # Documents max par compétiteur
```

#### Par Assessment (4 compétiteurs):

| Candidat | web_search | web_search | rerank | Coût | Notes |
|---|---|---|---|---|---|
| Compétiteur 1 | 1 appel | 1 appel (fallback) | 1 appel | $0.24 | 6 docs/appel |
| Compétiteur 2 | 1 appel | 1 appel (fallback) | 1 appel | $0.24 | 6 docs/appel |
| Compétiteur 3 | 1 appel | 1 appel (fallback) | 1 appel | $0.24 | 6 docs/appel |
| Compétiteur 4 | 1 appel | 1 appel (fallback) | 1 appel | $0.24 | 6 docs/appel |
| **TOTAL** | **4** | **4** | **4** | **$0.96** | **12 appels** |

##### Détail par appel:
```
web_search appel:
  ├─ Endpoint: /web-search
  ├─ Payload: { query, summary: true, count: 6 }
  ├─ Retour: 6 résultats max (title, url, summary)
  ├─ Coût: $0.08/appel
  └─ Peut y avoir fallback (appel 2) si peu de résultats

rerank appel:
  ├─ Endpoint: /rerank
  ├─ Payload: { model: "langsearch-reranker-v1", documents: [], query }
  ├─ Retour: Ranking des documents par pertinence
  ├─ Coût: $0.08/appel
  └─ Documents: 8-12 à reranker
```

#### Langsearch Total: **$0.96 par assessment**

---

### **MISTRAL CALLS** (LLM Reasoning)

#### Configuration par défaut:
```python
benchmark_max_mistral_calls_per_assessment = 4  # Max 4 appels
mistral_model = "mistral-medium-latest"
```

#### Par Assessment (4 appels max):

| Flux | Appel | Tokens Input | Tokens Output | Coût (Free) | Coût (Pro) |
|---|---|---|---|---|---|
| Intent Routing | 1 | 300 | 50 | $0 | $0.001 |
| Coverage Detection | 1-2 | 400 | 100 | $0 | $0.002 |
| Recommendation Gen | 1-2 | 600 | 200 | $0 | $0.004 |
| Report Synthesis | 0-1 | 800 | 150 | $0 | $0.004 |
| **TOTAL** | **4** | **~2,100** | **~500** | **$0** | **$0.015** |

##### Mistral Large (PRO) Tarification:
```
Input:  $2.70 per 1M tokens
Output: $8.10 per 1M tokens

2,100 input × ($2.70/1M) = $0.0057
500 output × ($8.10/1M) = $0.0041
────────────────────────────────
Total Mistral = $0.0098 ≈ $0.01
```

#### Mistral Total: **$0.01-0.015 par assessment** (Pro)

---

## 📊 Coûts par Composant (PRO Tier)

```
┌─────────────────────────────────────────────────────┐
│ Décomposition Coût par Assessment ($0.98)           │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Langsearch Web Search (4 appels):     $0.32 (33%) │
│ Langsearch Reranking (4 appels):      $0.32 (33%) │
│ Mistral Reasoning (4 appels):         $0.01 (1%)  │
│ Overhead/Fees:                        $0.33 (33%) │
│                                                      │
├─────────────────────────────────────────────────────┤
│ TOTAL:                                $0.98 (100%) │
└─────────────────────────────────────────────────────┘
```

**Insight:** 66% des coûts viennent de Langsearch (recherche web). Mistral est très bon marché en comparaison.

---

## 🎯 Optimisations Possibles

### 1. Caching de Requêtes (10-30% d'économie)
```
Si même compétiteur est recherché pour 10 assessments différents:
  Sans cache: 10 × $0.96 = $9.60
  Avec cache: 1 × $0.96 + 9 × $0 = $0.96
  Économie: 90% !

Implémentation:
  • Mistral supporte prompt caching (coût: -50%)
  • Langsearch: Cache applicatif (Redis/DB)
  • Économie potentielle: 10-30% selon domaine
```

### 2. Réduire nombre de candidats (~30-40% d'économie)
```
Au lieu de 4 candidats:
  Considérer seulement 3:  4 × $0.24 × 0.75 = $0.72 vs $0.96
  Ou 2 candidats:          4 × $0.24 × 0.5  = $0.48 vs $0.96

Trade-off: Moins de diversité dans recommendations
```

### 3. Réduire documents par candidat (15-20% d'économie)
```
Au lieu de 8 docs max:
  Limiter à 5-6 docs max:  Réduit requêtes rerank légèrement
  Économie: 10-15%

Trade-off: Moins de coverage potentielle
```

### 4. Batch Processing (overhead reduction)
```
Traiter plusieurs assessments en parallèle:
  Réduction overhead de rate-limiting
  Économie: 5-10%

Faisable avec les configs actuelles
```

---

## 📈 Scaling - Quand ça devient critique

### Jour 0-30 (FREE tier confortable)
```
100-200 assessments/mois
├─ ~4-7 assessments/jour
├─ Langsearch: 48-84 appels/jour  (limite: 2000/jour ✅)
├─ Mistral: 400-800 appels/jour   (limite: 100/jour ❌ DÉPASSÉ)
└─ Status: Mistral SATURÉ, mais peut fallback

Action: Monitorer, aucune action nécessaire
```

### Jour 31-90 (FREE tier atteint limites)
```
500 assessments/mois
├─ ~16-17 assessments/jour
├─ Langsearch: 192-204 appels/jour (limite: 2000/jour ✅)
├─ Mistral: 1600+ appels/jour     (limite: 100/jour ❌ BIEN DÉPASSÉ)
└─ Status: CRITIQUE - Mistral rate-limited

Action: PASSER À PRO immédiatement
```

### Jour 91+ (Passage à PRO)
```
1000+ assessments/mois
├─ ~33+ assessments/jour
├─ Langsearch: 396+ appels/jour   (limite PRO: illimitée ✅)
├─ Mistral: 3200+ appels/jour     (limite PRO: illimitée ✅)
└─ Status: STABLE avec PRO

Coût: ~$980/mois
Action: Surveiller rate-limits en cas de spike
```

---

## 🔐 Rate Limits (Important!)

### FREE Tier
```
Mistral:
  • 1 req/sec → ~86K req/jour → Seulement 21,500 assessments/jour
  • Limite réelle: 100 req/jour (limite basse) → ~25 assessments/jour

Langsearch:
  • 2000 req/jour max → ~167 assessments/jour max
  • Bottleneck à 250 assessments/jour
```

### PRO Tier (Recommandé)
```
Mistral Large:
  • 100 req/min (limite par défaut) → 144,000 req/jour ✅
  • Peut supporter 36,000+ assessments/jour

Langsearch Pro:
  • Négociable, typiquement illimitée ou très haute
  • Peut supporter 100,000+ req/jour
  • Suffisant pour 10,000+ assessments/jour
```

---

## 💰 Coût Marginal par Utilisateur Supplémentaire

### Chez 1000 assessments/mois existants

```
Ajouter 100 assessments supplémentaires:
  Langsearch:   100 × $0.96 × 100% = $96
  Mistral:      100 × $0.01 × 100% = $1
  ────────────────────────────────────────
  Coût incrémental: $97 ≈ $0.97/assessment

C'est donc extrêmement rentable de scaler !
ROI par assessment supplémentaire: (Prix client - $0.97) / (Prix client)
```

### Exemple: Si vous facturez $100/assessment
```
Marge brute API: $100 - $0.98 = $99.02 (99%)
C'est du pur profit après coûts API !
```

---

## 🔄 Flux API Détaillé (Code)

### 1. SemanticLeadersService (Langsearch)
```python
async def _evaluate_candidate(...):
    # Par candidate:
    search_queries = self._build_search_queries(...)  # 1-2 queries
    
    # Appel 1-2: Web search
    retrieved = await self._web_search_candidates(
        queries=search_queries,
        max_docs=8  # Peut faire 2 appels web_search si fallback
    )
    
    # Appel 3: Rerank
    reranked = await self._semantic_rerank(
        query=rerank_query,
        documents=documents,
        top_n=6-8
    )
    
    # Résultat: 3-4 appels Langsearch par candidat
    # × 4 candidates = 12-16 appels total
```

### 2. LLM Services (Mistral)
```python
# IntentRouter
await mistral_gateway.chat_messages(messages)  # Appel 1

# CoverageDetector  
await mistral_gateway.chat_messages(messages)  # Appel 2

# RecommendationGenerator
await mistral_gateway.chat_messages(messages)  # Appel 3

# ReportSynthesis
await mistral_gateway.chat_messages(messages)  # Appel 4

# Total: 4 appels Mistral par assessment
```

---

## 📋 Checklist de Validation PRO Tier

Avant de passer à PRO, vérifier:

- [ ] Volume stabilisé > 500 assessments/mois
- [ ] Mistral rate-limits atteints (vérifier logs)
- [ ] Budget approuvé (~$1K/mois pour Langsearch Pro)
- [ ] Contrats signés avec Mistral + Langsearch
- [ ] Plan de migration défini (0-downtime possible)
- [ ] Monitoring mis en place pour surveiller coûts

---

## 🎓 Références

**Configuration actuelle:**
- Fichier: `backend/app/core/config.py`
- Services: `backend/app/services/assessment/reporting/`
- Gateway: `backend/app/services/llm/core/gateway.py`

**Tarification (à jour 2025):**
- Mistral: https://mistral.ai/pricing/
- Langsearch: https://www.langsearch.com/pricing
- Claude: https://www.anthropic.com/pricing

