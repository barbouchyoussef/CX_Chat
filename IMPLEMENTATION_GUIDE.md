# Section 2 & 3 React Implementation Guide

## Overview
This document maps the static HTML preview (`section2.html`) to the production React components and backend data structures.

## Architecture

```
AssessmentReport.tsx
├── ReportHeroSection (Section 1 - unchanged)
├── CompetitiveLandscapeSection (Section 2 - NEW)
└── CapabilitiesAxesSection (Section 3 - NEW)
```

All components are wired through `AssessmentReport.tsx` and rendered via `AssessmentResultsPage.tsx`.

---

## Section 2: Competitive Landscape

### HTML Structure → React Component
**File**: `frontend/src/components/report/CompetitiveLandscapeSection.tsx`

### Data Mapping

| HTML Element | Data Source | Component |
|---|---|---|
| Step badges (1, 2, 3) | `competitive_landscape[].level` | `StepButton` |
| Stage labels (Basic/Established/Advanced) | `competitive_landscape[].label` | `StepButton` |
| Competitor chips | `competitive_landscape[].competitors[]` | `CompetitorChip` |
| Competitor name | `competitor.company_name` | `CompetitorChip` text |
| "You" indicator | `competitor.is_you` | CSS highlight |
| Drawer content (Why they're here) | `competitor.note` | `CompetitorDrawer` |
| Connector fill animation | `currentStageIndex` | `Connector` component |

### Backend Payload Shape

```typescript
// From: FinalReport.competitive_landscape
{
  competitive_landscape: [
    {
      level: 1,
      label: "Basic",
      summary: "Stage description text",
      competitors: [
        {
          key: "unique-competitor-key",
          company_name: "Company Name",
          note: "Why they're at this stage - visible in drawer",
          stage_level: 1,
          stage_label: "Basic",
          logo_url: "https://...",
          is_you: false,
          evidence_links: []
        }
      ]
    }
    // ... 2 more stages
  ]
}
```

### Current Status
- **Backend**: Returns `[]` (empty) — feature disabled for now
- **Component**: Handles empty state gracefully with placeholder message
- **When backend enables**: Component automatically renders competitor data

---

## Section 3: What's Working & What's Missing

### HTML Structure → React Component
**File**: `frontend/src/components/report/CapabilitiesAxesSection.tsx`

### Data Mapping

| HTML Element | Data Source | Component |
|---|---|---|
| Axis tabs | `axes[]` | `AxisTab` |
| Tab label (Manage/Analyze/Improve) | `axis.axis` capitalized | `AxisTab` text |
| Tab score (e.g., "2/3") | Map `axis.maturity_band` to level 1-3 | `AxisTab` score display |
| Working column capabilities | `capabilities[]` filtered by `maturity_band !== "Basic"` | `CapabilityPill` |
| Missing column capabilities | `capabilities[]` filtered by `maturity_band === "Basic"` | `CapabilityPill` |
| Capability name | `capability.capability` | `CapabilityPill` heading |
| Capability summary | `capability.rationale \|\| capability.recommendation` | `CapabilityPill` description |
| Capability band badge | `capability.maturity_band` | `CapabilityPill` tag |
| Modal evidence | `capability.rationale \|\| capability.recommendation` | `CapabilityEvidenceModal` |

### Backend Payload Shape

```typescript
// From: FinalReport.axes
axes: [
  {
    axis: "manage",  // lowercase key
    score_percent: 63.0,
    maturity_band: "Established",
    axis_level: 2,
    axis_level_label: "Level 2"
  }
  // ... more axes (analyze, improve)
]

// From: FinalReport.capabilities
capabilities: [
  {
    axis: "manage",
    capability: "Support/ticketing process and ownership",
    maturity_band: "Established",  // Basic | Established | Advanced
    assessment_status: "assessed",
    confidence: 0.85,
    rationale: "Issues do not disappear into inboxes...",
    recommendation: "Next steps to improve...",
    priority: "high"  // optional
  }
  // ... more capabilities grouped by axis
]
```

### Axis Color Coding

| Axis | Tone | Color Codes |
|---|---|---|
| Manage | gold | `#ffd447` (default), `#c8973f` (dark) |
| Analyze | cyan | `#85eaff` (default), `#00d4ff` (dark) |
| Improve | violet | `#9f93ff` (default), `#4d22df` (dark) |

Applied to:
- Tab badge backgrounds when active
- Connector fill gradients
- Stat card backgrounds

---

## Key Features Implemented

### 1. Axis Tab Switching
- Click axis tab → panel switches with fade-in animation (260ms)
- Active tab shows colored gradient background
- Tabs display score as "X/3" format

### 2. Capability Evidence Modal
- Click capability pill → modal opens
- Shows capability name, axis, working/missing status
- Displays evidence from `rationale` field
- Close button or ESC key to dismiss
- Click outside modal to close

### 3. Competitive Stage Navigation
- Click step button → stepper advances
- Connector fill animates from left to right
- Competitor chips update below stepper
- Default competitor is marked with `is_you = true`
- Drawer updates when competitor chip is clicked

### 4. Responsive Design
- Mobile: Single column layout, stepper wraps to flex column
- Tablet: Grid adjusts to 2-column for capabilities
- Desktop: Full 3-column stepper, 2-column capability grid

---

## Styling Architecture

### CSS Variables Used (from HTML)
```css
--bg-deep: #111318
--ink: #ffffff
--ink-soft: rgba(255, 255, 255, 0.84)
--ink-muted: rgba(255, 255, 255, 0.58)
--line: rgba(255, 255, 255, 0.12)
```

### Tailwind + Inline Approach
- Tailwind classes for spacing, layout, borders, base colors
- Inline `style` prop for complex gradients (requires inline styles)
- CSS classes for animations (fadeIn)

### Background Gradient (Both Sections)
```css
radial-gradient(circle at 76% 12%, rgba(239, 202, 222, 0.92), rgba(239, 202, 222, 0.16) 24%, transparent 44%),
radial-gradient(circle at 84% 82%, rgba(116, 38, 255, 0.56), transparent 28%),
linear-gradient(118deg, #121318 0%, #17315f 34%, #2a29a7 68%, #491fd8 100%)
```

---

## Testing Checklist

### Section 2 (Competitive Landscape)
- [ ] Empty state shows placeholder when `competitive_landscape = []`
- [ ] Stepper steps 1-3 are clickable
- [ ] Connector fills animate when advancing steps
- [ ] Competitor chips update when stage changes
- [ ] Clicking competitor chip updates drawer
- [ ] Drawer shows competitor info from `note` field
- [ ] Mobile responsive: stepper wraps, chips show in single column

### Section 3 (Axes & Capabilities)
- [ ] Axis tabs are clickable
- [ ] Panel animates in with fadeIn (260ms)
- [ ] Capabilities split correctly: Working (non-Basic), Missing (Basic)
- [ ] Working and Missing columns show correct counts
- [ ] Capability pills are clickable
- [ ] Modal opens with capability details
- [ ] Modal closes on button click, ESC key, and outside click
- [ ] Modal shows evidence from rationale field
- [ ] Tab colors match: gold, cyan, violet
- [ ] Responsive: single column on mobile, 2 columns on desktop

### Backend Integration
- [ ] `report.axes` populated correctly
- [ ] `report.capabilities` includes all assessed capabilities
- [ ] `report.competitive_landscape` is present (empty or with data)
- [ ] No TypeScript errors in components

---

## Future Enhancements

### Section 2 (When Backend Enables)
1. Populate `competitive_landscape` in backend
2. Enhance drawer with interactive evidence links
3. Add competitor logo display
4. Show "strength" indicators per competitor

### Section 3
1. Add axis-level description/intro text to backend schema
2. Implement filtering by priority level
3. Add export capability evidence list
4. Link recommendations to improvement actions

---

## Files Overview

| File | Purpose | Status |
|---|---|---|
| `CapabilitiesAxesSection.tsx` | Section 3 component (axes + capabilities) | ✅ Complete |
| `CompetitiveLandscapeSection.tsx` | Section 2 component (competitive landscape) | ✅ Complete |
| `AssessmentReport.tsx` | Entry point - imports both sections | ✅ Updated |
| `assessment-results-page.tsx` | Layout wrapper | ✅ Updated |
| `index.css` | Global styles + fadeIn animation | ✅ Updated |
| `final-report.ts` | TypeScript types | ✅ Ready (no changes needed) |
| `final_report.py` | Backend schema | ✅ Ready (no changes needed) |

---

## No Backend Schema Changes Required

The backend schema already supports all required data:
- `FinalReportCompetitiveStage` and `FinalReportCompetitiveCompetitor` are defined
- `FinalReportAxisItem` and `FinalReportCapabilityItem` are defined
- `competitive_landscape` is already an optional field in `FinalReportResponse`

**However**, to populate competitive landscape data, the `final_report_service.py` needs to be updated to call the benchmarking service. Currently:
```python
# Line 278 in final_report_service.py
competitive_landscape: list[FinalReportCompetitiveStage] = []
```

Once the competitive benchmarking layer is ready, change this to:
```python
competitive_landscape = await self._get_competitive_landscape(assessment_id)
```
