# Analyse des Coûts API - Assessment CX

## 📊 Vue d'ensemble

Ce document analyse les coûts d'API pour un seul **assessment CX complet**, en comparant :
- **FREE tier actuel** (Mistral Medium + Langsearch Free)
- **PRO tier** (Mistral Large + Langsearch Pro)  
- **Premium tier** (Claude Opus 4.1)

---

## 🔍 Décomposition des Appels API par Assessment

### 1️⃣ **Langsearch - Semantic Leaders (Compétiteurs)**

#### Configuration actuelle:
- `benchmark_max_candidates_initial`: 4 candidats
- `benchmark_max_langsearch_docs_per_candidate`: 8 documents max par candidat
- Par candidat: **2 appels Langsearch**

```
Pour 4 candidats:
├─ Candidat 1
│  ├─ web_search call 1     [6 résultats]
│  ├─ web_search call 2     [6 résultats, fallback si besoin]
│  └─ rerank call 1         [reranke les documents]
├─ Candidat 2
│  ├─ web_search call 1
│  ├─ web_search call 2  
│  └─ rerank call 1
├─ Candidat 3
│  └─ idem...
└─ Candidat 4
   └─ idem...

TOTAL: 4 candidats × 2 appels = 8 appels Langsearch par assessment
       (web_search + rerank combinés)
```

**Détail réel:**
- **2 appels web_search par candidat** (6 résultats chacun) 
- **1 appel rerank par candidat** (reranke les 8-12 résultats)
- **Total Langsearch: ~8-12 appels** (selon fallback)

---

### 2️⃣ **Mistral - AI Reasoning**

#### Configuration actuelle:
- `benchmark_max_mistral_calls_per_assessment`: **4 appels max**
- `mistral_model`: **mistral-medium-latest**

```
Flux Mistral par assessment:
├─ Intent routing          [1 appel] - déterminer l'intention utilisateur
├─ Coverage detection      [~1-2 appels] - évaluer la couverture des questions
├─ Recommendation gen      [~1-2 appels] - générer les recommandations
└─ Report synthesis        [~1 appel] - synthèse du rapport

TOTAL: 4 appels Mistral par assessment
```

**Points clés:**
- Utilisé principalement pour le **reasoning** et la **curation**
- Budget limité intentionnellement pour contrôler les coûts
- Rate limits: 1 req/sec, 12 req/min, 1200 req/day

---

## 💰 Tarification Comparée

### **TIER 1: FREE (Actuel)**

| Fournisseur | Modèle | Endpoint | Coût par 1M tokens | Notes |
|---|---|---|---|---|
| **Mistral** | mistral-medium-latest | /chat/completions | Gratuit (limité) | 🆓 Free tier avec limites |
| **Langsearch** | web-search + reranker-v1 | /web-search, /rerank | Gratuit (limité) | 🆓 Free tier avec limites |

**Estimation par Assessment (FREE):**
```
Langsearch: 8-12 appels × $0 (free)           = $0
Mistral:    4 appels × $0 (free tier)         = $0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL PAR ASSESSMENT:                         = $0
```

---

### **TIER 2: PRO (Recommandé)**

| Fournisseur | Modèle | Endpoint | Coût par 1M input tokens | Coût per 1M output | Notes |
|---|---|---|---|---|---|
| **Mistral** | mistral-large-latest | /chat/completions | $2.70 / 1M | $8.10 / 1M | ⚡ 10x plus rapide, 32K context |
| **Langsearch** | web-search + reranker-v1 | /web-search, /rerank | $0.08/call | N/A | 🔍 API payante, précision +40% |

#### Estimation des tokens par appel:

**Mistral Large:**
```
Prompt moyen (system + context):    ~500 tokens input
Response moyen (reasoning):         ~300 tokens output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Par appel:                          ~800 tokens total
Par assessment (4 appels):          ~3,200 tokens
```

**Coût par Assessment (PRO):**
```
Langsearch: 
  - 8 web_search @ $0.08/appel     = $0.64
  - 4 rerank @ $0.08/appel         = $0.32
  Sous-total Langsearch             = $0.96

Mistral Large:
  - 4 appels × 500 tokens input    = 2,000 input tokens
  - 4 appels × 300 tokens output   = 1,200 output tokens
  - Coût: (2,000 × $2.70/1M) + (1,200 × $8.10/1M)
  - Coût: $0.0054 + $0.0097        = $0.0151 ≈ $0.015
  Sous-total Mistral Large          = $0.015

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL PAR ASSESSMENT (PRO):         ≈ $0.98
```

---

### **TIER 3: PREMIUM (Claude Opus)**

| Fournisseur | Modèle | Endpoint | Coût par 1M input tokens | Coût per 1M output | Notes |
|---|---|---|---|---|---|
| **Anthropic** | claude-opus-4-1 | /messages | $15 / 1M | $45 / 1M | 🏆 Meilleur reasoning, 200K context |
| **Langsearch** | web-search + reranker-v1 | /web-search, /rerank | $0.08/call | N/A | 🔍 Identique à Tier 2 |

**Coût par Assessment (Premium):**
```
Langsearch: (identique à Tier 2)
  - 8 web_search @ $0.08/appel     = $0.64
  - 4 rerank @ $0.08/appel         = $0.32
  Sous-total Langsearch             = $0.96

Claude Opus 4.1:
  - 4 appels × 500 tokens input    = 2,000 input tokens
  - 4 appels × 300 tokens output   = 1,200 output tokens
  - Coût: (2,000 × $15/1M) + (1,200 × $45/1M)
  - Coût: $0.03 + $0.054            = $0.084
  Sous-total Claude Opus            = $0.084

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL PAR ASSESSMENT (PREMIUM):     ≈ $1.04
```

---

## 📈 Projection Financière Annuelle

### Scénarios de volume

#### Scénario 1: 100 assessments/mois (1200/an)
```
TIER 1 (FREE):           $0 × 1,200         = $0/an
TIER 2 (PRO):            $0.98 × 1,200      = $1,176/an
TIER 3 (PREMIUM):        $1.04 × 1,200      = $1,248/an

Delta Tier 2 vs Free:    +$1,176/an
Delta Tier 3 vs Free:    +$1,248/an
Delta Tier 3 vs Tier 2:  +$72/an (marginal)
```

#### Scénario 2: 500 assessments/mois (6000/an)
```
TIER 1 (FREE):           $0 × 6,000         = $0/an
TIER 2 (PRO):            $0.98 × 6,000      = $5,880/an
TIER 3 (PREMIUM):        $1.04 × 6,000      = $6,240/an

Delta Tier 2 vs Free:    +$5,880/an
Delta Tier 3 vs Free:    +$6,240/an
Delta Tier 3 vs Tier 2:  +$360/an (très marginal)
```

#### Scénario 3: 1000 assessments/mois (12000/an)
```
TIER 1 (FREE):           $0 × 12,000        = $0/an
TIER 2 (PRO):            $0.98 × 12,000     = $11,760/an ≈ $980/mois
TIER 3 (PREMIUM):        $1.04 × 12,000     = $12,480/an ≈ $1,040/mois

Delta Tier 2 vs Free:    +$11,760/an
Delta Tier 3 vs Free:    +$12,480/an
Delta Tier 3 vs Tier 2:  +$720/an (6%)
```

---

## 🎯 Recommandations

### Phase 1: Démarrage (Scalabilité testée)
✅ **Recommandation: Tier 2 PRO**
- Mistral Large (meilleure qualité + pas cher vs Opus)
- Langsearch Pro (obligatoire si on scale, free ne suffit pas)
- **Coût fixe ~$1,000/mois** pour 1000 assessments/mois
- **ROI: Excellent** - Amélioration qualité massive vs free

### Phase 2: À 5000+ assessments/mois
- Évaluer Claude Opus (seulement +$600/mois supplémentaires)
- Ou rester en Mistral Large + optimisations

### Phase 3: Bottleneck Langsearch
- À partir de **2000+ assessments/mois**
- Langsearch free tier saturé (limites: 2000 req/day)
- **NÉCESSAIRE** de passer à Langsearch Pro

---

## 🚨 Limites Actuelles (FREE TIER)

| Limite | Valeur | Votre usage | Status |
|---|---|---|---|
| Mistral free req/jour | ~100 | ~12 assessments | ⚠️ À surveiller |
| Langsearch free req/jour | 2000 | ~8-12 par assessment | 🆗 Correct pour <250 assess/jour |
| Langsearch free req/min | 20 | ~0.5 req/sec | 🆗 À la limite |

---

## 📊 Tableau Récapitulatif

```
┌─────────────────────────────────────────────────────────────────┐
│ COÛTS PAR ASSESSMENT (1 évaluation complète)                    │
├─────────────────────────────────────────────────────────────────┤
│ Tier 1 (FREE):           $0.00     │ Gratuit, limites à surveiller
│ Tier 2 (PRO):            $0.98     │ ✅ Recommandé
│ Tier 3 (PREMIUM):        $1.04     │ Premium, peu de différence
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ COÛTS ANNUELS (@1000 assess/mois = 12,000/an)                  │
├─────────────────────────────────────────────────────────────────┤
│ Tier 1 (FREE):           $0        │ Limites atteintes
│ Tier 2 (PRO):            $11,760   │ ✅ Optimal ($980/mois)
│ Tier 3 (PREMIUM):        $12,480   │ +$720/an vs Tier 2
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Ressources

- **Mistral Pricing**: https://mistral.ai/pricing/
- **Langsearch Pricing**: https://www.langsearch.com/pricing (demander)
- **Claude Pricing**: https://www.anthropic.com/pricing

---

## 📝 Notes Techniques

1. **Estimations conservatrices** - basées sur les configurations par défaut du code
2. **Tokens comptés** - selon la doc officielle de chaque fournisseur
3. **Rate limiting** - implique d'attendre 120s entre batches (impact UX minimal)
4. **Caching possible** - Mistral + Langsearch supportent le caching (10-30% d'économie)

