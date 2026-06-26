# 📱 LLM Calls Par Question/Réponse - Détails Granulaires

## 🎯 Vue d'Ensemble

Votre assessment utilise **9 capabilities** avec environ **2-3 questions par capability**, soit **18-27 questions** typiquement.

Chaque question/réponse génère un **nombre variable d'appels LLM**.

---

## 📊 Flux Complet d'un Assessment

```
ASSESSMENT NORMAL (18-27 questions)
│
├─ PHASE INTRODUCTION (1 appel)
│  └─ Generate first question → QuestionComposer (1 appel Mistral)
│
├─ PHASE QUESTIONNAIRE (répété pour chaque question)
│  ├─ Question N préparée (préfetch)
│  │  └─ Generate question → QuestionComposer (1 appel)
│  ├─ Utilisateur répond
│  ├─ Intent Routing (si besoin)
│  │  └─ route_user_intent → IntentRouter (0-1 appels Mistral)
│  ├─ Coverage Detection (si VALID_ANSWER)
│  │  └─ detect_coverage → CoverageDetector (1-2 appels Mistral)
│  └─ Memory Update (si coverage trouvée)
│     └─ update_axis_memory → MemoryService (1 appel Mistral)
│
├─ PHASE REPORTING (fin de l'assessment)
│  ├─ Semantic Leaders Search (Langsearch)
│  │  └─ 4 candidats × (web_search + rerank) = 8 appels Langsearch
│  ├─ Recommendations Generation
│  │  └─ generate_recommendations_batch → RecommendationGenerator (2-4 appels Mistral)
│  └─ Report Synthesis
│     └─ generate_report_synthesis → ReportSynthesis (1 appel Mistral)
│
└─ ASSESSMENT TERMINÉ
```

---

## 🔍 Détail des Appels par Étape

### **ÉTAPE 1: Introduction**

```
PREMIÈRE QUESTION
├─ Action: generate_question()
├─ Service: QuestionComposer
├─ LLM Calls: 1 appel Mistral
├─ Tokens: ~300 input, ~80 output
├─ Coût (PRO): $0.001
└─ Notes:
   - Pas de retry (sauf erreur réseau)
   - Cached possible (même axis = même pattern)
```

---

### **ÉTAPE 2: Boucle Questionnaire (répétée N fois)**

```
POUR CHAQUE QUESTION (18-27 fois):

┌─ A. RÉCEPTION RÉPONSE UTILISATEUR
│
├─ B. INTENT ROUTING
│  ├─ Route: route_user_intent(answer)
│  ├─ Logique: 
│  │  ├─ Try fast_route() FIRST (règles, pas LLM)
│  │  │  ├─ Patterns simples: "continue", "skip", "pass", "move on"
│  │  │  │  └─ AUCUN appel LLM ✅
│  │  │  ├─ Negative evidence: "je ne sais pas", "on n'a pas", etc.
│  │  │  │  └─ AUCUN appel LLM ✅
│  │  │  ├─ Confusion requests
│  │  │  │  └─ AUCUN appel LLM ✅
│  │  │  └─ Autres cas
│  │  │     └─ Fallback à LLM call ⚠️
│  │  └─ If fast_route() returns None:
│  │     └─ Call Mistral via IntentRouter (1 appel)
│  ├─ Estimation: 
│  │  • 70% → fast path (0 appels) ✅
│  │  • 30% → LLM (1 appel)
│  │  • Moyenne: 0.3 appels par réponse
│  └─ Coût estimé: $0.0003 par réponse (30% des cas)
│
├─ C. COVERAGE DETECTION (Si intent == VALID_ANSWER)
│  ├─ Route: detect_coverage(answer, criteria, rubrics)
│  ├─ Logique:
│  │  ├─ Essai 1: Appeler LLM pour détecter couverture
│  │  │  └─ 1 appel Mistral
│  │  ├─ Parser JSON de la réponse
│  │  │  ├─ Si valid JSON → retour
│  │  │  └─ Si invalid JSON → Retry
│  │  └─ Essai 2 (si needed): Re-call avec message correctionnel
│  │     └─ 1 appel Mistral supplémentaire
│  ├─ Estimation:
│  │  • JSON success rate: ~95% (la plupart du temps 1 appel)
│  │  • Retry rate: ~5% (2 appels)
│  │  • Moyenne: 1.05 appels par réponse VALID_ANSWER
│  ├─ Probabilité VALID_ANSWER:
│  │  • ~80% des réponses sont VALID_ANSWER
│  │  • ~20% sont skip/resume/low-quality (pas de coverage detection)
│  └─ Coût estimé: $0.006 par réponse (80% × 1.05 appels)
│
├─ D. MEMORY UPDATE (Si coverage détectée)
│  ├─ Route: update_axis_memory(axis, answer, covered_labels)
│  ├─ Service: MemoryService
│  ├─ LLM Calls: 1 appel Mistral (TOUJOURS)
│  ├─ Tokens: ~400 input, ~120 output
│  ├─ Estimation:
│  │  • Probabilité (given VALID_ANSWER ET coverage found): 90%
│  │  • Moyennes sur tous les cas: 90% × 80% = 72% des réponses
│  └─ Coût estimé: $0.004 par réponse
│
├─ E. NEXT QUESTION GENERATION (Prefetch)
│  ├─ Route: generate_question(axis, missing, history...)
│  ├─ Service: QuestionComposer
│  ├─ LLM Calls: 1 appel Mistral
│  ├─ Timing: Exécuté en PARALLÈLE avec la réponse utilisateur
│  │  └─ Utilisateur ne voit pas ce délai
│  ├─ Caching: @async_lru_cache(maxsize=128)
│  │  └─ Appels répétés → Cached (0 appel supplémentaire)
│  ├─ Estimation:
│  │  • Sans cache: 1 appel par question
│  │  • Avec cache: 80% cache hit → 0.2 appels par question
│  └─ Coût estimé: $0.002 par question (prefetch)
│
└─ F. HANDLE NON-VALID INTENTS (Resume, Confusion)
   ├─ Si intent == RESUME
   │  └─ Skip coverage detection, go to next question
   │  └─ Aucun appel supplémentaire
   ├─ Si intent == CONFUSION
   │  └─ Generate clarification question
   │  └─ 1 appel Mistral (QuestionComposer.generate_clarification_question)
   └─ Coût estimé: $0.001 pour 20% des cas = $0.0002/réponse
```

---

## 🧮 Calcul des Appels par Question (Moyenne)

### Pour UNE réponse utilisateur (moyenne):

```
Intent Routing:
  • Fast path: 70% × 0 appels = 0
  • LLM fallback: 30% × 1 appel = 0.3
  • Sous-total: 0.3 appels

Coverage Detection (si VALID_ANSWER):
  • Probabilité VALID_ANSWER: 80%
  • Appels par VALID_ANSWER: 1.05
  • Sous-total: 0.8 × 1.05 = 0.84 appels

Memory Update (si coverage found):
  • Probabilité: 72% (voir calcul au-dessus)
  • Appels: 1 appel garanti
  • Sous-total: 0.72 appels

Next Question Generation (prefetch):
  • Avec cache: 0.2 appels (80% cache hit)
  • Sous-total: 0.2 appels

Clarification Questions (rare):
  • Probabilité: ~5%
  • Appels: 1 appel
  • Sous-total: 0.05 appels

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL PAR RÉPONSE: 0.3 + 0.84 + 0.72 + 0.2 + 0.05 = 2.11 appels Mistral
```

---

## 📈 Extrapolation pour un Assessment Complet

### Configuration Standard
```
Nombre de questions: 20 (moyenne, 9 capabilities × 2.2 questions)
Appels LLM par réponse: 2.11 (voir calcul au-dessus)
Appels Langsearch: 8-12 (semantic leaders)
Appels post-assessment: 4 (recommendations + report)

TOTAL APPELS PAR ASSESSMENT:
├─ Mistral (questionnaire): 20 × 2.11 = 42.2 appels
├─ Mistral (post-assessment): 4 appels
├─ Langsearch: 10 appels
└─ GRAND TOTAL: ~56 appels Mistral + 10 appels Langsearch
```

### Coûts (PRO Tier)
```
Mistral (Mistral Large):
  • 56 appels × 200 tokens/appel = 11,200 tokens
  • Prix input: 11,200 × $2.70/1M = $0.030
  • Prix output: 7,000 × $8.10/1M = $0.057
  • Sous-total Mistral: $0.087

Langsearch:
  • 10 appels × $0.08/appel = $0.80
  • Sous-total Langsearch: $0.80

TOTAL: $0.887 ≈ $0.89 par assessment
```

**Note**: Ceci est une ESTIMATION. Le vrai coût peut être:
- **Plus bas** avec plus de cache hits (67% gain possible)
- **Plus haut** avec retries coverage detection

---

## 🔬 Ventilation Détaillée par Service LLM

### 1. **IntentRouter** (0.3 appels/réponse en moyenne)
```
Service: IntentRouter
Fichier: backend/app/services/llm/intent/router.py

Appels par réponse:
  • Fast path (70%): 0 appels
    ├─ Simple patterns: "continue", "skip"
    ├─ Negative evidence: "je ne sais pas"
    └─ Confusion: "expliquez-moi"
  
  • LLM path (30%): 1 appel
    ├─ Prompt size: ~150 tokens input
    ├─ Response size: ~20 tokens output
    └─ Latency: <100ms (très rapide)

Coût: $0.0003 par réponse (30% des cas)
```

### 2. **CoverageDetectorService** (0.84 appels/réponse en moyenne)
```
Service: CoverageDetectorService
Fichier: backend/app/services/llm/coverage/detector.py

Appels par VALID_ANSWER:
  • Essai 1 (95%): 1 appel
    ├─ Prompt: Criteria list + answer + rubrics
    ├─ Input tokens: ~400
    ├─ Output tokens: ~150 (JSON structure)
    └─ Latency: ~500ms
  
  • Essai 2 (5% retry): +1 appel
    ├─ Correction prompt
    ├─ Input tokens: ~500
    └─ Output tokens: ~120

Moyenne appels: 1.05 par VALID_ANSWER
Probabilité VALID_ANSWER: 80%

Coût: $0.006 par réponse
```

### 3. **MemoryService** (0.72 appels/réponse en moyenne)
```
Service: MemoryService
Fichier: backend/app/services/llm/conversation/memory_service.py

Appels par coverage found:
  • Always 1 appel
    ├─ Prompt: Previous summary + new answer + labels
    ├─ Input tokens: ~400
    ├─ Output tokens: ~120
    └─ Latency: ~400ms

Probabilité: 72% (coverage detected AND coverage found)

Coût: $0.004 par réponse
```

### 4. **QuestionComposerService** (0.2 appels/question avec cache)
```
Service: QuestionComposerService
Fichier: backend/app/services/llm/conversation/question_composer.py

Appels par question:
  • Without cache: 1 appel
    ├─ Prompt: Axis context + missing topics + history
    ├─ Input tokens: ~350
    ├─ Output tokens: ~120
    └─ Latency: ~400ms
  
  • Caching: @async_lru_cache(maxsize=128)
    ├─ Cache hit rate: ~80% (questions similaires)
    ├─ Cache miss rate: ~20%
    └─ Appels réels: 0.2 par question

Coût: $0.002 par question
```

### 5. **RecommendationGeneratorService** (2-4 appels par assessment)
```
Service: RecommendationGeneratorService
Fichier: backend/app/services/llm/reporting/recommendation_generator.py

Appels par assessment:
  • Batch generation: ~4 appels
    ├─ 1 appel par capability cluster (9 cap × ~0.5 clustering)
    ├─ Input tokens: ~600 (evidence + rubrics)
    ├─ Output tokens: ~200 (recommendations JSON)
    └─ Latency: ~600ms per call

Total: 4 appels par assessment

Coût: $0.03 par assessment
```

### 6. **ReportSynthesisService** (1 appel par assessment)
```
Service: ReportSynthesisService
Fichier: backend/app/services/llm/reporting/report_synthesis.py

Appels par assessment:
  • Summary generation: 1 appel
    ├─ Input tokens: ~800 (full context)
    ├─ Output tokens: ~300 (report summary)
    └─ Latency: ~800ms

Total: 1 appel par assessment

Coût: $0.01 par assessment
```

---

## 📊 Tableau Récapitulatif Détaillé

```
┌────────────────────────────────────────────────────────────────┐
│ RÉSUMÉ APPELS LLM - PAR ASSESSMENT                             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ Service                  │ Appels/Assess │ % Total │ Coût     │
│ ─────────────────────────┼───────────────┼─────────┼──────────│
│ QuestionComposer         │ 20 × 0.2      │ 7%      │ $0.04    │
│ IntentRouter             │ 20 × 0.3      │ 11%     │ $0.006   │
│ CoverageDetector         │ 20 × 0.84     │ 31%     │ $0.12    │
│ MemoryService            │ 20 × 0.72     │ 26%     │ $0.08    │
│ ClarificationComposer    │ 20 × 0.05     │ 2%      │ $0.01    │
│ RecommendationGenerator  │ 4 appels      │ 15%     │ $0.03    │
│ ReportSynthesis          │ 1 appel       │ 4%      │ $0.01    │
│ ─────────────────────────┼───────────────┼─────────┼──────────│
│ TOTAL MISTRAL            │ ~56 appels    │ 100%    │ $0.28    │
│                                                                │
│ Langsearch               │ 10 appels     │ N/A     │ $0.80    │
│ ─────────────────────────┼───────────────┼─────────┼──────────│
│ GRAND TOTAL              │ ~66 appels    │ 100%    │ $1.08    │
│                                                                │
└────────────────────────────────────────────────────────────────┘

Note: Ceci est un estimate. Voir variations ci-dessous.
```

---

## 🔄 Variations Réalistes

### Scénario 1: Assessment "Léger" (Questions courtes)
```
Moins de couverture trouvée:
  • Questions: 15
  • Coverage detection success: 60% (vs 80% normal)
  • Memory updates: 50%
  • Appels Mistral: 15 × 1.8 = 27 appels
  • Langsearch: 8 appels
  • TOTAL: $0.55 + $0.64 = $1.19
```

### Scénario 2: Assessment "Complet" (Réponses détaillées)
```
Beaucoup de couverture:
  • Questions: 25
  • Coverage detection success: 95%
  • Memory updates: 85%
  • Clarifications: 10%
  • Appels Mistral: 25 × 2.4 = 60 appels
  • Langsearch: 12 appels
  • TOTAL: $0.35 + $0.96 = $1.31
```

### Scénario 3: Assessment "Avec Cache" (Questions répétées)
```
Haute réutilisation du cache (même company type):
  • Questions: 20
  • Cache hit rate: 95%
  • Memory cache: 40% (même axis summary)
  • Appels Mistral: 20 × 1.3 = 26 appels
  • Langsearch: 8 appels
  • TOTAL: $0.15 + $0.64 = $0.79
```

---

## 💰 Impact sur Pricing

### Coûts par Scenario (PRO Tier)

```
Scénario Léger:     $1.19/assessment
Scénario Normal:    $1.08/assessment  ← Votre baseline estimée
Scénario Complet:   $1.31/assessment
Scénario Cached:    $0.79/assessment
```

### Implication pour facturation
```
Si vous facturez $100/assessment:
  • Coût API: $1.08 (1.08% du prix)
  • Marge brute: $98.92 (98.92%)
  • Très rentable! ✅

Si vous avez high caching (multi-clients):
  • Coût API: $0.79
  • Marge brute: $99.21 (99.21%)
  • Encore plus rentable! ✅✅
```

---

## 🎯 Observations Clés

### Points forts du design
1. **Fast-path optimization** - 70% d'intent routing sans LLM
2. **Caching** - 80% des questions réutilisées
3. **Prefetch** - Génération de question en parallèle
4. **Retry limited** - Seulement 5% des cas nécessitent retry

### Opportunités d'optimisation
1. **Augmenter cache hit** - Regrouper plus de questions similaires (gain: -20%)
2. **Réduire couverture detection retries** - Améliorer prompt JSON (gain: -2%)
3. **Batch recommendations** - Grouper les appels (gain: -10%)
4. **Streaming responses** - Commencer le rapport avant la fin (UX gain)

---

## 📝 Notes Techniques

### LLM History Management
```
Chaque appel chat_messages() a un maximum:
  • llm_max_history_turns: 12
  • llm_max_history_chars: 6000
  
Signification:
  • Pas de conversation infiniment longue
  • Limite d'overhead de tokens
  • Impact: Contenus continu dans 20 questions typiques
```

### Rate Limiting Impact
```
Mistral: 1 req/sec (PRO default)
  • 56 appels × 0.5s avg = ~28 secondes total
  • Mais PARALLÈLE pour questions = ~2-3 secondes en pratique

Langsearch: 2 req/sec (PRO)
  • 10 appels × 0.5s avg = ~5 secondes
  • Séquentiel (candidates évalués un par un)
```

---

## 🔗 Références Code

- **QuestionComposer**: `backend/app/services/llm/conversation/question_composer.py:107,170`
- **IntentRouter**: `backend/app/services/llm/intent/router.py:52`
- **CoverageDetector**: `backend/app/services/llm/coverage/detector.py:78`
- **MemoryService**: `backend/app/services/llm/conversation/memory_service.py:49`
- **Answer Flow**: `backend/app/services/assessment/conversation/answer_flow_service.py:90,151`
- **LLM Facade**: `backend/app/services/llm/core/facade_service.py:133,197`

