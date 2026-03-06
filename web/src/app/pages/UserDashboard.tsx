import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  User, BookOpen, Calendar, Star, TrendingUp, Loader2, Plus,
  CheckCircle2, XCircle, AlertCircle, HelpCircle, ChevronDown, ChevronUp,
  Check, ArrowRight
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";
import { unitsFromCourseNumber } from "../lib/courseUtils";
import { AddToPlannerDialog } from "../components/AddToPlannerDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface APIPlanItem {
  plan_item_id: number;
  plan_term_id: number;
  subject: string;
  course_number: string;
  course_name: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "DROPPED";
  grade: string | null;
  note: string | null;
  year_index: number;
  season: string;
}

interface APIProgram {
  program_id: number;
  name: string;
  degree_type: string;
  total_units: number | null;
}

interface GroupResult {
  heading: string;
  satisfied: boolean;
  units_completed: number;
  units_required: number;
  missing_courses: string[];
  is_header: boolean;
  heading_level: number;
}

interface PrereqWarning {
  course: string;
  missing_prereq: string;
}

interface ValidationResult {
  total_units_required: number;
  total_units_completed: number;
  units_remaining: number;
  groups: GroupResult[];
  prereq_warnings: PrereqWarning[];
}

interface GPAResult {
  gpa: number;
  has_grades: boolean;
  letter_grade: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UNITS_TO_GRADUATE = 120;

// Valid McMaster letter grades for the grade input hint
const GRADE_OPTIONS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

// ---------------------------------------------------------------------------
// Gateway program → specialization mappings
//
// Any McMaster program that has an undifferentiated first year then fans out
// into specializations in Year 2 belongs here.  The key is a substring that
// uniquely identifies the gateway program; the value is the list of programs
// the student can choose from.
// ---------------------------------------------------------------------------

type SpecializationOption = { label: string; value: string };

const GATEWAY_SPECIALIZATIONS: Array<{
  /** Substring matched case-insensitively against the current program name. */
  gatewaySubstring: string;
  options: SpecializationOption[];
}> = [
  {
    gatewaySubstring: "engineering i",
    options: [
      { label: "Chemical Engineering",                 value: "Chemical Engineering, Chemical Engineering Co-op (B.Eng.)" },
      { label: "Civil Engineering",                    value: "Civil Engineering, Civil Engineering Co-op (B.Eng.)" },
      { label: "Computer Engineering",                 value: "Computer Engineering, Computer Engineering Co-op (B.Eng.)" },
      { label: "Electrical Engineering",               value: "Electrical Engineering, Electrical Engineering Co-op (B.Eng.)" },
      { label: "Engineering Physics",                  value: "Engineering Physics, Engineering Physics Co-op (B.Eng.)" },
      { label: "Materials Engineering",                value: "Materials Engineering, Materials Engineering Co-op (B.Eng.)" },
      { label: "Mechanical Engineering",               value: "Mechanical Engineering, Mechanical Engineering Co-op (B.Eng.)" },
      { label: "Mechatronics Engineering",             value: "Mechatronics Engineering, Mechatronics Engineering Co-op (B.Eng.)" },
      { label: "Software Engineering",                 value: "Software Engineering, Software Engineering Co-op (B.Eng.)" },
      { label: "Chemical & Biomedical Engineering",    value: "Chemical and Biomedical Engineering, Chemical and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Civil & Biomedical Engineering",       value: "Civil and Biomedical Engineering, Civil and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Electrical & Biomedical Engineering",  value: "Electrical and Biomedical Engineering, Electrical and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Engineering Physics & Biomedical",     value: "Engineering Physics and Biomedical Engineering, Engineering Physics and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Materials & Biomedical Engineering",   value: "Materials and Biomedical Engineering, Materials and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Mechanical & Biomedical Engineering",  value: "Mechanical and Biomedical Engineering, Mechanical and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Mechatronics & Biomedical Engineering",value: "Mechatronics and Biomedical Engineering, Mechatronics and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Software & Biomedical Engineering",    value: "Software and Biomedical Engineering, Software and Biomedical Engineering Co-Op (B.Eng.BME)" },
    ],
  },
  {
    // IBEHS I — Integrated Biomedical Engineering & Health Sciences first year
    gatewaySubstring: "ibehs i",
    options: [
      { label: "Chemical & Biomedical Engineering",    value: "Chemical and Biomedical Engineering, Chemical and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Civil & Biomedical Engineering",       value: "Civil and Biomedical Engineering, Civil and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Electrical & Biomedical Engineering",  value: "Electrical and Biomedical Engineering, Electrical and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Engineering Physics & Biomedical",     value: "Engineering Physics and Biomedical Engineering, Engineering Physics and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Materials & Biomedical Engineering",   value: "Materials and Biomedical Engineering, Materials and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Mechanical & Biomedical Engineering",  value: "Mechanical and Biomedical Engineering, Mechanical and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Mechatronics & Biomedical Engineering",value: "Mechatronics and Biomedical Engineering, Mechatronics and Biomedical Engineering Co-Op (B.Eng.BME)" },
      { label: "Software & Biomedical Engineering",    value: "Software and Biomedical Engineering, Software and Biomedical Engineering Co-Op (B.Eng.BME)" },
    ],
  },
];

/**
 * Returns the list of specialization options if the given program is a
 * first-year gateway program, or an empty array if no specialization is needed.
 */
function getSpecializationsForProgram(program?: string | null): SpecializationOption[] {
  if (!program) return [];
  const lower = program.toLowerCase();
  const match = GATEWAY_SPECIALIZATIONS.find(g => lower.includes(g.gatewaySubstring));
  return match ? match.options : [];
}

/** True when the user is still in any undifferentiated first-year program. */
function isGatewayProgram(program?: string | null): boolean {
  return getSpecializationsForProgram(program).length > 0;
}

// ---------------------------------------------------------------------------
// AdvanceYearDialog
// Confirms the user wants to move to the next academic year and explains the
// auto-complete side-effect before anything is committed.
// ---------------------------------------------------------------------------

function AdvanceYearDialog({
  open,
  currentYear,
  pendingCount,
  userProgram,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  currentYear: number;
  pendingCount: number;
  userProgram?: string | null;
  onConfirm: (specialization?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<"specialize" | "confirm">("confirm");
  const [selectedSpec, setSelectedSpec] = useState("");
  const nextYear = currentYear + 1;

  // Does this program require choosing a specialization before advancing?
  const specializationOptions = getSpecializationsForProgram(userProgram);
  const needsSpecialization = specializationOptions.length > 0;

  // Reset internal state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setStep(needsSpecialization ? "specialize" : "confirm");
      setSelectedSpec("");
    }
  }, [open, needsSpecialization]);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(needsSpecialization ? selectedSpec || undefined : undefined);
    } finally {
      setConfirming(false);
    }
  };

  const specLabel = specializationOptions.find(s => s.value === selectedSpec)?.label;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">

        {/* ── Step 1: pick specialization (Engineering I only) ── */}
        {step === "specialize" && (
          <>
            <DialogHeader>
              <DialogTitle>Choose Your Specialization</DialogTitle>
              <DialogDescription>
                Engineering I students choose a specialized discipline for Year 2.
                This updates your program and degree requirements.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <Label>Engineering Specialization</Label>
              <Select value={selectedSpec} onValueChange={setSelectedSpec}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your specialization…" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {specializationOptions.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button onClick={() => setStep("confirm")} disabled={!selectedSpec}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: confirm advance ── */}
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Advance to Year {nextYear}?</DialogTitle>
              <DialogDescription>
                You're moving from <strong>Year {currentYear}</strong> to{" "}
                <strong>Year {nextYear}</strong>.{" "}
                {pendingCount > 0
                  ? `${pendingCount} course${pendingCount === 1 ? "" : "s"} still marked as Planned or In Progress in Year ${currentYear} (and earlier) will be automatically set to Completed.`
                  : "There are no unfinished courses from previous years to carry over."}
                {specLabel && (
                  <>
                    {" "}Your program will be updated to{" "}
                    <strong>{specLabel}</strong>.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground px-1">
              You can still update individual statuses and add grades from your dashboard afterwards.
            </p>
            <DialogFooter className="gap-2">
              {needsSpecialization && (
                <Button variant="ghost" onClick={() => setStep("specialize")} disabled={confirming}>
                  ← Back
                </Button>
              )}
              <Button variant="outline" onClick={onCancel} disabled={confirming}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={confirming}>
                {confirming && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                <ArrowRight className="h-4 w-4 mr-1" />
                Advance to Year {nextYear}
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// GradePromptDialog
// Shown when a user marks a course as COMPLETED — lets them optionally
// enter their letter grade before saving.
// ---------------------------------------------------------------------------

function GradePromptDialog({
  open,
  courseName,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  courseName: string;
  onConfirm: (grade: string | null) => void;
  onCancel: () => void;
}) {
  const [grade, setGrade] = useState("");

  // Reset grade input each time the dialog opens for a new course
  useEffect(() => {
    if (open) setGrade("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as Completed</DialogTitle>
          <DialogDescription>
            Optionally enter your grade for <span className="font-medium">{courseName}</span>.
            You can skip this and add it later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Label htmlFor="grade-input">Grade (optional)</Label>
          {/* Free-text input with datalist for autocomplete suggestions */}
          <Input
            id="grade-input"
            list="grade-options"
            placeholder="e.g. A+"
            value={grade}
            onChange={(e) => setGrade(e.target.value.toUpperCase())}
            className="uppercase"
          />
          <datalist id="grade-options">
            {GRADE_OPTIONS.map(g => <option key={g} value={g} />)}
          </datalist>
          <p className="text-xs text-muted-foreground">
            Valid grades: {GRADE_OPTIONS.join(", ")}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(null)}
          >
            Skip Grade
          </Button>
          <Button
            onClick={() => {
              // Validate grade is one of the known values or empty
              const trimmed = grade.trim();
              const valid = GRADE_OPTIONS.includes(trimmed);
              onConfirm(valid ? trimmed : null);
            }}
            disabled={grade.trim() !== "" && !GRADE_OPTIONS.includes(grade.trim())}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers for section-grouped requirement display
// ---------------------------------------------------------------------------

/** Parse "Level II: 37 Units" → 2, "Level III" → 3, "Level IV" → 4, etc. */
function parseRomanYear(heading: string): number | null {
  const m = heading.match(/Level\s+(I{1,3}V?|VI{0,3}|IV|V)/i);
  if (!m) return null;
  const r = m[1].toUpperCase();
  const table: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
  return table[r] ?? null;
}

interface DegreeSection {
  heading: string;
  levelYear: number | null;
  items: GroupResult[];
}

/**
 * Split the flat groups array emitted by the backend into sections.
 * A new section starts at every group with is_header === true.
 * Items between headers (or before the first header) are collected under
 * that section.
 */
function buildDegreeSections(groups: GroupResult[]): DegreeSection[] {
  const sections: DegreeSection[] = [];
  let cur: DegreeSection = { heading: "", levelYear: null, items: [] };
  for (const g of groups) {
    if (g.is_header) {
      if (cur.heading !== "" || cur.items.length > 0) sections.push(cur);
      cur = { heading: g.heading, levelYear: parseRomanYear(g.heading), items: [] };
    } else {
      cur.items.push(g);
    }
  }
  if (cur.heading !== "" || cur.items.length > 0) sections.push(cur);
  return sections;
}

// ---------------------------------------------------------------------------
// DegreeValidation sub-component
// ---------------------------------------------------------------------------

function DegreeValidation({
  userID,
  programName,
  yearOfStudy,
}: {
  userID: number;
  programName: string;
  yearOfStudy: number;
}) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "si-gi" → whether group gi inside section si is expanded
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({});
  // section index → whether the section accordion is open
  const [sectionExpanded, setSectionExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    authFetch("/api/programs")
      .then(res => {
        if (!res.ok) throw new Error(`Programs fetch returned ${res.status}`);
        return res.json() as Promise<APIProgram[]>;
      })
      .then(programs => {
        const match = programs.find(p =>
          p.name.toLowerCase().includes(programName.toLowerCase()) ||
          programName.toLowerCase().includes(p.name.toLowerCase())
        );
        if (!match) throw new Error(`No program found matching "${programName}"`);
        return match.program_id;
      })
      .then(programID =>
        authFetch(`/api/users/${userID}/validation?program_id=${programID}`)
      )
      .then(res => {
        if (!res.ok) throw new Error(`Validation returned ${res.status}`);
        return res.json() as Promise<ValidationResult>;
      })
      .then(data => { setValidation(data); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [userID, programName]);

  const toggleGroup = (si: number, gi: number) =>
    setGroupExpanded(prev => { const k = `${si}-${gi}`; return { ...prev, [k]: !prev[k] }; });

  const toggleSection = (si: number) =>
    setSectionExpanded(prev => ({ ...prev, [si]: !prev[si] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground text-sm">Checking your requirements…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-6 justify-center">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (!validation) return null;

  const sections = buildDegreeSections(validation.groups);
  const nonHeaderGroups = validation.groups.filter(g => !g.is_header);
  const satisfiedCount = nonHeaderGroups.filter(g => g.satisfied).length;
  const totalGroups = nonHeaderGroups.length;
  const progressPercent = totalGroups > 0 ? Math.round((satisfiedCount / totalGroups) * 100) : 0;

  /**
   * Section open/close state.
   * Default: only the section whose levelYear matches the user's current year is open;
   * past years (already done) and future years start collapsed.
   */
  const isSectionOpen = (si: number): boolean => {
    if (si in sectionExpanded) return sectionExpanded[si];
    const sec = sections[si];
    if (!sec || sec.levelYear === null) return true; // ungrouped items → always open
    return sec.levelYear === yearOfStudy;
  };

  /** Render a single requirement-group row (the leaf items inside a section). */
  const renderGroupRow = (group: GroupResult, si: number, gi: number) => {
    const key = `${si}-${gi}`;
    const isOpen = !!groupExpanded[key];
    const hasDetail = group.missing_courses.length > 0 ||
      (group.units_required > 0 && group.units_completed < group.units_required);
    return (
      <div key={key} className="border rounded-lg overflow-hidden">
        <button
          onClick={() => hasDetail && toggleGroup(si, gi)}
          className={[
            "w-full flex items-center justify-between p-3 text-left transition-colors",
            hasDetail ? "hover:bg-muted/50 cursor-pointer" : "cursor-default",
          ].join(" ")}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {group.satisfied ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : group.units_completed > 0 ? (
              <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            ) : group.missing_courses.length === 0 ? (
              <HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{group.heading}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
            {group.units_required > 0 && (
              <span className="text-xs text-muted-foreground">
                {group.units_completed}/{group.units_required} units
              </span>
            )}
            <Badge
              variant={group.satisfied ? "default" : "outline"}
              className={group.satisfied
                ? "bg-green-500/20 text-green-700 border-green-500/30 dark:text-green-400"
                : group.units_completed > 0
                  ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-400"
                  : ""}
            >
              {group.satisfied ? "Done" : group.units_completed > 0 ? "Partial" : "Missing"}
            </Badge>
            {hasDetail && (
              isOpen
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {isOpen && group.missing_courses.length > 0 && (
          <div className="border-t px-4 py-3 bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Still needed:</p>
            <div className="flex flex-wrap gap-2">
              {group.missing_courses.map((code, j) => {
                const parts = code.split(" ");
                const subject = parts[0];
                const courseNumber = parts.slice(1).join(" ");
                return (
                  <div key={j} className="flex items-center gap-1">
                    <Link to={`/courses/${subject}/${courseNumber}`}>
                      <Badge variant="outline" className="text-xs hover:bg-primary/10 transition-colors cursor-pointer">
                        {code}
                      </Badge>
                    </Link>
                    <AddToPlannerDialog
                      subject={subject}
                      courseNumber={courseNumber}
                      trigger={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-muted-foreground hover:text-primary"
                          title={`Add ${code} to planner`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isOpen && group.missing_courses.length === 0 && group.units_completed < group.units_required && (
          <div className="border-t px-4 py-3 bg-muted/20">
            <p className="text-xs text-muted-foreground">
              {group.units_required - group.units_completed} units of elective credit still needed
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top-line stats */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Requirements Satisfied</span>
          <span className="font-medium">{satisfiedCount} / {totalGroups} groups</span>
        </div>
        <Progress value={progressPercent} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-xl font-bold text-green-600">{validation.total_units_completed}</div>
          <div className="text-xs text-muted-foreground">Completed</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-xl font-bold">{validation.total_units_required}</div>
          <div className="text-xs text-muted-foreground">Required</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-xl font-bold text-orange-500">{validation.units_remaining}</div>
          <div className="text-xs text-muted-foreground">Remaining</div>
        </div>
      </div>

      {validation.prereq_warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-medium text-sm">
            <AlertCircle className="h-4 w-4" />
            Prerequisite Warnings ({validation.prereq_warnings.length})
          </div>
          {validation.prereq_warnings.map((w, i) => (
            <div key={i} className="text-sm text-muted-foreground ml-6">
              <span className="font-medium text-foreground">{w.course}</span>
              {" "}requires{" "}
              <span className="font-medium text-foreground">{w.missing_prereq}</span>
              {" "}which isn't completed yet
            </div>
          ))}
        </div>
      )}

      {/* Year-level sections */}
      <div className="space-y-3">
        {sections.map((sec, si) => {
          // A past level (e.g. Level I for a Year-2 student) is treated as
          // fully complete regardless of actual plan data.
          const forceDone = sec.levelYear !== null && sec.levelYear < yearOfStudy;
          const allSatisfied = forceDone || sec.items.every(g => g.satisfied);
          const anySatisfied = forceDone || sec.items.some(g => g.satisfied || g.units_completed > 0);
          const totalReq = sec.items.reduce((s, g) => s + g.units_required, 0);
          const totalComp = forceDone
            ? totalReq
            : sec.items.reduce((s, g) => s + g.units_completed, 0);
          const isOpen = isSectionOpen(si);

          // No section heading — render items directly without a wrapper accordion
          if (sec.heading === "") {
            return (
              <div key={si} className="space-y-2">
                {sec.items.map((g, gi) => renderGroupRow(g, si, gi))}
              </div>
            );
          }

          return (
            <div key={si} className="border-2 rounded-xl overflow-hidden">
              {/* Section accordion header */}
              <button
                onClick={() => toggleSection(si)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {allSatisfied ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : anySatisfied ? (
                    <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
                  )}
                  <span className="font-semibold">{sec.heading}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {totalReq > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {totalComp}/{totalReq} units
                    </span>
                  )}
                  <Badge
                    variant={allSatisfied ? "default" : "outline"}
                    className={
                      allSatisfied
                        ? "bg-green-500/20 text-green-700 border-green-500/30 dark:text-green-400"
                        : anySatisfied
                        ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-400"
                        : ""
                    }
                  >
                    {forceDone ? "Complete ✓" : allSatisfied ? "Done" : anySatisfied ? "Partial" : "Missing"}
                  </Badge>
                  {isOpen
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Section children */}
              {isOpen && (
                <div className="p-3 space-y-2">
                  {sec.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No specific sub-requirements listed for this level.
                    </p>
                  ) : (
                    sec.items.map((g, gi) => renderGroupRow(g, si, gi))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function UserDashboard() {
  const { user, updateUser } = useAuth();

  const [planItems, setPlanItems] = useState<APIPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gpaData, setGpaData] = useState<GPAResult | null>(null);

  // Grade prompt dialog state — holds the item being marked complete
  // until the user confirms (with or without a grade)
  const [pendingComplete, setPendingComplete] = useState<APIPlanItem | null>(null);

  // Advance-year dialog
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  // Current academic year (defaults to 1 for new users who haven't set it yet)
  const currentYear = user?.yearOfStudy ?? 1;
  const MAX_YEAR = 4;

  // How many planned/in-progress items from previous years would be auto-completed
  const pendingCompletionCount = planItems.filter(
    pi => pi.year_index < currentYear + 1 &&
          (pi.status === "PLANNED" || pi.status === "IN_PROGRESS")
  ).length;

  useEffect(() => {
    if (!user) return;
    authFetch(`/api/users/${user.userID}/plan`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data: APIPlanItem[]) => { setPlanItems(data ?? []); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    authFetch(`/api/users/${user.userID}/gpa`)
      .then(res => res.json())
      .then((data: GPAResult) => setGpaData(data))
      .catch(() => setGpaData(null));
  }, [user]);

  // Refresh plan and GPA after any status/grade change
  const refreshPlan = async () => {
    if (!user) return;
    const [planData, gpaRes] = await Promise.all([
      authFetch(`/api/users/${user.userID}/plan`).then(r => r.json()),
      authFetch(`/api/users/${user.userID}/gpa`).then(r => r.json()),
    ]);
    setPlanItems(planData ?? []);
    setGpaData(gpaRes);
  };

  // Called when user picks a status from the dropdown
  const handleStatusChange = async (item: APIPlanItem, newStatus: string) => {
    if (newStatus === "COMPLETED") {
      // Don't save yet — open the grade prompt dialog first
      setPendingComplete(item);
      return;
    }
    // For all other statuses, save immediately
    await authFetch(`/api/users/${user!.userID}/plan/${item.plan_item_id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    await refreshPlan();
  };

  // Called when user confirms the grade prompt (grade may be null if skipped)
  const handleGradeConfirm = async (grade: string | null) => {
    if (!pendingComplete || !user) return;
    const payload: any = { status: "COMPLETED" };
    // Only include `grade` when the user provided one; omit to leave NULL in DB
    if (grade !== null) payload.grade = grade;

    await authFetch(`/api/users/${user.userID}/plan/${pendingComplete.plan_item_id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setPendingComplete(null);
    await refreshPlan();
  };

  const handleGradeCancel = () => {
    // User cancelled — don't change the status at all
    setPendingComplete(null);
  };

  // Advance academic year — calls backend, updates local auth state, refreshes plan
  const handleAdvanceYear = async (specialization?: string) => {
    if (!user) return;
    const body: Record<string, unknown> = {};
    if (specialization) body.specialization = specialization;

    const res = await authFetch(`/api/users/${user.userID}/advance-year`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      setAdvanceError(text || "Failed to advance year");
      return;
    }
    const data = await res.json();
    // Update both yearOfStudy and (if returned) the new specialization program.
    updateUser({
      yearOfStudy: data.new_year,
      ...(data.new_program ? { program: data.new_program } : {}),
    });
    setAdvanceDialogOpen(false);
    setAdvanceError(null);
    await refreshPlan();
  };

  const completedItems = planItems.filter(pi => pi.status === "COMPLETED");
  const plannedItems = planItems.filter(
    pi => pi.status === "PLANNED" || pi.status === "IN_PROGRESS"
  );

  // Group planned items by year_index for the year-bucketed view
  const plannedByYear = plannedItems.reduce<Record<number, APIPlanItem[]>>((acc, item) => {
    if (!acc[item.year_index]) acc[item.year_index] = [];
    acc[item.year_index].push(item);
    return acc;
  }, {});
  const plannedYearEntries = Object.entries(plannedByYear)
    .map(([yr, items]) => ({ yr: Number(yr), items }))
    .sort((a, b) => a.yr - b.yr);

  const unitsCompleted = completedItems.reduce(
    (sum, pi) => sum + unitsFromCourseNumber(pi.course_number), 0
  );
  const unitsPlanned = plannedItems.reduce(
    (sum, pi) => sum + unitsFromCourseNumber(pi.course_number), 0
  );
  const unitsRemaining = UNITS_TO_GRADUATE - unitsCompleted;
  const progressPercent = Math.min((unitsCompleted / UNITS_TO_GRADUATE) * 100, 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Failed to load dashboard: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-8">

      {/* Grade prompt dialog — shown when user picks "Completed" */}
      <GradePromptDialog
        open={pendingComplete !== null}
        courseName={pendingComplete
          ? `${pendingComplete.subject} ${pendingComplete.course_number}`
          : ""}
        onConfirm={handleGradeConfirm}
        onCancel={handleGradeCancel}
      />

      {/* Advance-year confirmation dialog */}
      <AdvanceYearDialog
        open={advanceDialogOpen}
        currentYear={currentYear}
        pendingCount={pendingCompletionCount}
        userProgram={user?.program}
        onConfirm={handleAdvanceYear}
        onCancel={() => { setAdvanceDialogOpen(false); setAdvanceError(null); }}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {user?.displayName}</p>
        </div>
        <Button asChild>
          <Link to="/planner">
            <Calendar className="h-4 w-4 mr-2" />
            View Degree Planner
          </Link>
        </Button>
      </div>

      {/* Profile card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto md:mx-0">
              <User className="h-12 w-12 text-primary" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-2xl font-bold">{user?.displayName}</h2>
                <p className="text-muted-foreground">
                  {user?.program || user?.yearOfStudy
                    ? [user?.program, user?.yearOfStudy ? `Year ${user.yearOfStudy}` : null]
                        .filter(Boolean).join(" · ")
                    : user?.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{unitsCompleted} Units Completed</Badge>
              </div>

              {/* ── Academic-year stepper ── */}
              <div className="pt-1">
                <p className="text-xs text-muted-foreground font-medium mb-2">Academic Year</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {Array.from({ length: MAX_YEAR }, (_, i) => i + 1).map(yr => (
                    <div key={yr} className="flex items-center gap-1">
                      <div
                        className={[
                          "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                          yr < currentYear
                            ? "bg-green-500 text-white"
                            : yr === currentYear
                            ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                            : "bg-muted text-muted-foreground",
                        ].join(" ")}
                      >
                        {yr < currentYear ? <Check className="h-3.5 w-3.5" /> : yr}
                      </div>
                      {yr < MAX_YEAR && (
                        <div
                          className={[
                            "h-0.5 w-5",
                            yr < currentYear ? "bg-green-500" : "bg-muted",
                          ].join(" ")}
                        />
                      )}
                    </div>
                  ))}

                  {/* Advance button — hidden when already in final year */}
                  {currentYear < MAX_YEAR ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2 text-xs h-7 gap-1"
                      onClick={() => setAdvanceDialogOpen(true)}
                    >
                      <TrendingUp className="h-3 w-3" />
                      Advance to Year {currentYear + 1}
                    </Button>
                  ) : (
                    <Badge
                      variant="outline"
                      className="ml-2 bg-green-500/10 text-green-600 border-green-500/20"
                    >
                      Final Year
                    </Badge>
                  )}
                </div>
                {advanceError && (
                  <p className="text-xs text-destructive mt-1">{advanceError}</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{completedItems.length}</div>
                <div className="text-xs text-muted-foreground">Courses Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{plannedItems.length}</div>
                <div className="text-xs text-muted-foreground">Courses Planned</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              <div>
                <div className="text-2xl font-bold">{unitsCompleted}</div>
                <div className="text-xs text-muted-foreground">Total Units</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">
                  {gpaData?.has_grades ? gpaData.gpa.toFixed(1) : "–"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {gpaData?.has_grades ? `${gpaData.letter_grade} · GPA` : "Average Grade"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Degree Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Degree Progress</CardTitle>
          <CardDescription>Track your progress towards graduation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Units Completed</span>
              <span className="font-medium">{unitsCompleted} / {UNITS_TO_GRADUATE}</span>
            </div>
            <Progress value={progressPercent} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{unitsCompleted}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{unitsPlanned}</div>
              <div className="text-sm text-muted-foreground">Planned</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{unitsRemaining}</div>
              <div className="text-sm text-muted-foreground">Remaining</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirement Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Requirement Breakdown</CardTitle>
          <CardDescription>
            {user?.program
              ? `Checking your completed courses against ${user.program}`
              : "Set your program in your profile to see requirement tracking"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user?.program ? (
            <DegreeValidation userID={user.userID} programName={user.program} yearOfStudy={currentYear} />
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No program selected. Update your profile to enable requirement tracking.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed courses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Completed Courses</CardTitle>
              <CardDescription>Courses you have successfully completed</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/courses">Browse Courses</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {completedItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No completed courses yet. Start planning your academic journey!
              </p>
            ) : (
              completedItems.map(item => (
                <Link key={item.plan_item_id} to={`/courses/${item.subject}/${item.course_number}`}>
                  <div className="flex items-center gap-3 flex-wrap p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <h3 className="font-semibold">{item.subject} {item.course_number}</h3>
                    <Badge variant="secondary">{unitsFromCourseNumber(item.course_number)} units</Badge>
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                      Completed
                    </Badge>
                    {item.grade && <Badge variant="outline">{item.grade}</Badge>}
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Planned courses — with inline status dropdown + grade prompt */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Planned Courses</CardTitle>
              <CardDescription>Courses you plan to take</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/planner">Manage Plan</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {plannedItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No courses planned yet. Visit the degree planner to get started!
              </p>
            ) : (
              plannedYearEntries.map(({ yr, items }) => {
                const isPast = yr < currentYear;
                const isCurrent = yr === currentYear;
                return (
                  <div key={yr} className="mb-4 last:mb-0">
                    {/* Year bucket header */}
                    <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
                      <span
                        className={[
                          "text-xs font-semibold uppercase tracking-wider",
                          isPast
                            ? "text-muted-foreground"
                            : isCurrent
                            ? "text-primary"
                            : "text-foreground",
                        ].join(" ")}
                      >
                        Year {yr}
                      </span>
                      {isPast && (
                        <Badge variant="outline" className="text-xs py-0 bg-muted/50">
                          Past
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge
                          variant="outline"
                          className="text-xs py-0 bg-primary/10 text-primary border-primary/30"
                        >
                          Current
                        </Badge>
                      )}
                      {!isPast && !isCurrent && (
                        <Badge variant="outline" className="text-xs py-0">
                          Upcoming
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2">
                      {items.map(item => (
                        <div
                          key={item.plan_item_id}
                          className={[
                            "flex items-center justify-between p-4 border rounded-lg transition-colors",
                            isPast
                              ? "opacity-60 bg-muted/30 hover:opacity-80"
                              : "hover:bg-muted/50",
                          ].join(" ")}
                        >
                          {/* Course info — clicking navigates to course detail */}
                          <Link
                            to={`/courses/${item.subject}/${item.course_number}`}
                            className="flex items-center gap-3 flex-wrap flex-1"
                          >
                            <h3 className="font-semibold">{item.subject} {item.course_number}</h3>
                            <Badge variant="secondary">{unitsFromCourseNumber(item.course_number)} units</Badge>
                            <Badge variant="outline">
                              {item.season} · Year {item.year_index}
                            </Badge>
                          </Link>

                          {/* Status dropdown — selecting COMPLETED triggers grade prompt */}
                          <Select
                            value={item.status}
                            onValueChange={(newStatus) => handleStatusChange(item, newStatus)}
                          >
                            <SelectTrigger className="h-7 text-xs w-32 ml-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PLANNED">Planned</SelectItem>
                              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                              <SelectItem value="COMPLETED">Completed</SelectItem>
                              <SelectItem value="DROPPED">Dropped</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}