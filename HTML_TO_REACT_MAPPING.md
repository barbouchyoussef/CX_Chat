# HTML-to-React Element Mapping Reference

This document provides a line-by-line mapping of how HTML elements from `section2.html` were converted to React components.

---

## Section 2: Competitive Landscape

### HTML Structure
```html
<section class="section">
  <div class="orbital-ring" aria-hidden="true"></div>
  <div class="orbital-ring-small" aria-hidden="true"></div>
  <div class="orbital-ring-left" aria-hidden="true"></div>

  <div class="section-head">
    <span class="section-number">02</span>
    <h2 class="section-title">Where You Stand — Competitive Landscape</h2>
  </div>

  <div class="panel-inner">
    <div class="stepper-shell">
      <div class="stepper-head">
        <!-- 3 step-button elements with connectors -->
      </div>
    </div>
  </div>
</section>
```

### React Component Equivalent
**File:** `CompetitiveLandscapeSection.tsx`

```tsx
export default function CompetitiveLandscapeSection({ competitiveLandscape }: Props)
```

**Element Mappings:**

| HTML | React | Component | Notes |
|------|-------|-----------|-------|
| `.section` | `<section>` wrapper | Container | Added relative, z-10, background gradient |
| `.orbital-ring` elements | `<div className="...rounded-full border...">` | Orbital decorations | 3 positioned divs |
| `.section-head` | `<div className="flex items-center gap-4">` | Header | Flex layout with number and title |
| `.section-number` | `<span>02</span>` | Section marker | Monospace font, uppercase |
| `.section-title` | `<h2>Where You Stand...</h2>` | Title | Responsive text size |
| `.stepper-head` | `<div className="grid grid-cols-[...]">` | Stepper container | Grid with 5 columns for 3 steps + 2 connectors |
| `.step-wrap` | Container div | Wrapper | Flex justify-center |
| `.step-button` | `<StepButton />` | Component | Renders step 1, 2, or 3 |
| `.step-badge` | `<span>` with gradient | Badge | Circular with number |
| `.connector` | `<Connector />` | Component | Fills left-to-right based on state |
| `.comp-chip` | `<CompetitorChip />` | Component | Renders per-competitor card |
| `.drawer` | `<CompetitorDrawer />` | Component | Shows selected competitor info |

### Data Flow
```
CompetitiveLandscapeSection
├── Props: competitiveLandscape: FinalReportCompetitiveStage[]
├── State: currentStageIndex, selectedCompetitorKey
└── Renders:
    ├── StepButton × 3
    ├── Connector × 2
    ├── CompetitorChip × (number of competitors in stage)
    └── CompetitorDrawer (1)
```

---

## Section 3: Axes & Capabilities

### HTML Structure
```html
<section class="section">
  <div class="section-head">
    <span class="section-number">03</span>
    <h1 class="section-title">What's Working &amp; What's Missing</h1>
  </div>

  <div class="panel">
    <div class="panel-inner">
      <div class="axis-tabs" id="axis-tabs"></div>
      <div id="axis-panels"></div>
    </div>
  </div>
</section>

<div class="modal" id="evidence-modal">
  <!-- Modal content -->
</div>
```

### React Component Equivalent
**File:** `CapabilitiesAxesSection.tsx`

```tsx
export default function CapabilitiesAxesSection({ axes, capabilities }: Props)
```

**Element Mappings:**

| HTML | React | Component | Notes |
|------|-------|-----------|-------|
| `.section` | `<section>` wrapper | Container | Background gradient + position relative |
| `.orbital-ring` elements | `<div>` × 3 | Decorations | Positioned orbital ring borders |
| `.section-head` | `<div className="flex items-center gap-4">` | Header | Number + title layout |
| `.section-number` | `<span>03</span>` | Section marker | Monospace, uppercase |
| `.section-title` | `<h2>What's Working...</h2>` | Title | Responsive clamp sizing |
| `.panel` | `<div className="rounded-[28px] border...">` | Panel wrapper | Border + gradient background |
| `.axis-tabs` | `<div className="grid grid-cols-3">` | Tabs container | 3-column grid |
| `.axis-tab` button | `<AxisTab />` | Component | × 3 (one per axis) |
| `.axis-panel` | `<AxisPanel />` | Component | Rendered when active |
| `.axis-panel-head` | `<div className="grid gap-[18px]...">` | Panel header | Grid layout for title + stat |
| `.axis-panel-title` | `<h3>Manage: what's real...</h3>` | Heading | Dynamic based on axis |
| `.axis-stat-card` | `<article className="...">` | Stat box | Shows maturity %, label |
| `.axis-grid` | `<div className="grid grid-cols-1 lg:grid-cols-2">` | Capabilities grid | Responsive columns |
| `.cap-col.working` | `<div className="...">` | Working column | Emerald gradient background |
| `.cap-col.missing` | `<div className="...">` | Missing column | Rose gradient background |
| `.cap-col-head` | `<div className="flex items-start justify-between">` | Column header | Title + count |
| `.cap-pill` | `<CapabilityPill />` | Component | Clickable capability card |
| `.cap-pill-name` | `<p className="cap-pill-name">` | Capability title | From `capability.capability` |
| `.cap-tag` | `<span className="cap-tag ...">` | Maturity badge | Shows maturity band |
| `.cap-pill-summary` | `<p className="cap-pill-summary">` | Description | From `capability.rationale` |
| `.modal` | `<CapabilityEvidenceModal />` | Component | Modal overlay |
| `.modal-card` | `<div className="...rounded-[22px]...">` | Modal card | Max-width 420px, max-height 52vh |
| `.modal-head` | `<div className="flex items-start justify-between">` | Modal header | Title + close button |
| `.modal-overline` | `<div className="font-mono uppercase...">` | Metadata text | Axis + status label |
| `.modal-title` | `<h2>` | Modal title | Capability name |
| `.close-btn` | `<button>` | Close button | Dismisses modal |
| `.evidence-card` | `<div className="rounded-[18px]...">` | Evidence container | Border + background |
| `.evidence-title` | `<h3>Supporting evidence</h3>` | Evidence label | Small heading |
| `.evidence-item` | `<div className="rounded-[14px]...">` | Evidence quote | From `capability.rationale` |

### Data Flow
```
CapabilitiesAxesSection
├── Props: axes: FinalReportAxisItem[], capabilities: FinalReportCapabilityItem[]
├── State: activeAxisId, selectedCapability, isModalOpen
├── Renders:
│  ├── AxisTab × (number of axes)
│  ├── AxisPanel (active axis)
│  │  ├── Working capabilities (CapabilityPill × n)
│  │  └── Missing capabilities (CapabilityPill × m)
│  └── CapabilityEvidenceModal
└── Filters capabilities by:
    ├── Working: capability.maturity_band !== "Basic"
    └── Missing: capability.maturity_band === "Basic"
```

---

## JavaScript to React State Mapping

### Section 2: Competitive Landscape

**Original HTML JS:**
```javascript
let currentStep = 2;
let selectedCompetitor = stageData[currentStep].drawerDefault;

function goToStep(step) {
  currentStep = Math.max(1, Math.min(3, step));
  selectedCompetitor = stageData[currentStep].drawerDefault;
  // Update UI...
}
```

**React Equivalent:**
```typescript
const [currentStageIndex, setCurrentStageIndex] = useState(1);
const [selectedCompetitorKey, setSelectedCompetitorKey] = useState<string>("");

const handleStageClick = (stageLevel: number) => {
  setCurrentStageIndex(stageLevel);
};
```

### Section 3: Axes & Capabilities

**Original HTML JS:**
```javascript
let tabsRoot = document.getElementById("axis-tabs");
let panelsRoot = document.getElementById("axis-panels");

tabsRoot.addEventListener("click", (event) => {
  const button = event.target.closest(".axis-tab");
  if (!button) return;
  activateAxis(button.dataset.axis);
});

panelsRoot.addEventListener("click", (event) => {
  const button = event.target.closest(".cap-pill");
  if (!button) return;
  openEvidenceModal(...);
});
```

**React Equivalent:**
```typescript
const [activeAxisId, setActiveAxisId] = useState(0);
const [selectedCapability, setSelectedCapability] = useState<FinalReportCapabilityItem | null>(null);
const [isModalOpen, setIsModalOpen] = useState(false);

// Tab click handler
const handleAxisTabClick = (index: number) => {
  setActiveAxisId(index);
};

// Pill click handler
const handleOpenModal = (capability: FinalReportCapabilityItem) => {
  setSelectedCapability(capability);
  setIsModalOpen(true);
};
```

---

## CSS Class Preservation

### Classes Reused 1:1 in React

Some HTML classes were kept as-is for reference during development:

| Original Class | Usage | React Implementation |
|---|---|---|
| `orbital-ring` | Decorative border | `className="rounded-full border..."` |
| `step-badge` | Step indicator | Inline styled badge |
| `axis-kicker` | Metadata label | Monospace span |
| `cap-title-row` | Icon + text row | Flex layout |
| `practice::before` | Checkmark circle | CSS pseudo-element (not in React) |
| `modal` | Evidence popup | `<CapabilityEvidenceModal />` |

### CSS Animations

| HTML Animation | React Implementation |
|---|---|
| `@keyframes fadeIn` | Added to `index.css` + `.animate-fadeIn` class |
| Connector fill width transition | `transition: width 320ms ease` inline |
| Pill hover transform | `hover:transform hover:-translate-y-0.5` |

---

## Backend Type Mapping

### Section 2 Types

**HTML data structure (hardcoded):**
```javascript
const stageData = {
  1: {
    drawerDefault: "local-operators",
    competitors: { /* ... */ }
  }
}
```

**Backend/React type:**
```typescript
type FinalReportCompetitiveStage = {
  level: number;           // 1, 2, or 3
  label: string;           // "Basic", "Established", "Advanced"
  summary: string;
  competitors: FinalReportCompetitiveCompetitor[];
};

type FinalReportCompetitiveCompetitor = {
  key: string;             // "local-operators", "you", etc.
  company_name: string;
  note: string;            // Why they're at this stage
  stage_level: number;
  stage_label: string;
  logo_url?: string | null;
  is_you?: boolean;
  evidence_links: [];
};
```

### Section 3 Types

**HTML data structure (hardcoded):**
```javascript
const reportData = [
  {
    axis: "manage",
    label: "Manage",
    score: 63,
    band: "Established",
    working: [ /* capabilities */ ],
    missing: [ /* capabilities */ ]
  }
]
```

**Backend/React types:**
```typescript
type FinalReportAxisItem = {
  axis: string;              // "manage", "analyze", "improve"
  score_percent: number;     // 0-100
  maturity_band: string;     // "Basic", "Established", "Advanced"
  axis_level?: number;
  axis_level_label?: string;
};

type FinalReportCapabilityItem = {
  axis: string;              // Links to FinalReportAxisItem.axis
  capability: string;        // Capability name
  maturity_band: string;     // "Basic", "Established", "Advanced"
  assessment_status?: string;
  confidence?: number;
  rationale?: string;        // Used as evidence in modal
  recommendation?: string;
  priority?: string;
};
```

---

## Responsive Breakpoints

### Tailwind Breakpoints Used

| Breakpoint | CSS | Applied To |
|---|---|---|
| Default (mobile) | No prefix | Stacked layout, full width |
| `sm:` | `@media (min-width: 640px)` | Increased padding |
| `lg:` | `@media (min-width: 1024px)` | Multi-column grids |

### Example: Capability Grid

```
Mobile (< 640px):   1 column (full width)
Tablet (640px+):    1 column (full width)
Desktop (1024px+):  2 columns (left/right)
```

---

## Animation Timing

### Preserved from HTML

| Animation | Timing | Easing | Purpose |
|---|---|---|---|
| Axis panel entry | 260ms | ease | Panel fade-in on tab switch |
| Connector fill | 320ms | ease | Stepper progress animation |
| Capability pill hover | 220ms | ease | Button interaction feedback |
| Step badge hover | 220ms | ease | Step button interaction |

---

## Color Tokens

### Used Consistently Across Both Sections

| Token | Value | Usage |
|---|---|---|
| `--gold` | `#ffd447` | Manage axis, Stage 1 button |
| `--gold-deep` | `#c8973f` | Gold gradient dark edge |
| `--cyan` | `#85eaff` | Analyze axis, Stage 2 button |
| `--cyan-deep` | `#00d4ff` | Cyan gradient dark edge |
| `--violet` | `#9f93ff` | Improve axis, Stage 3 button |
| `--violet-deep` | `#4d22df` | Violet gradient dark edge |
| `--emerald` | `#61f2ba` | Working status checkmark |
| `--rose` | `#ff8ba7` | Missing status warning |

---

## Keyboard Interactions

| Interaction | Handling |
|---|---|
| ESC key | Closes evidence modal |
| Tab key | Standard focus management |
| Enter key | Activates buttons |

---

## Summary

All HTML elements have been methodically converted to React components while:
- Preserving the exact DOM hierarchy
- Maintaining visual styling and animations
- Mapping hardcoded data to backend types
- Keeping interactive behaviors intact
- Ensuring responsive design carries forward
