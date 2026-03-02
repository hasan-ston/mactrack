import { useState } from "react";
import { Check, Loader2, Plus, CalendarPlus } from "lucide-react";
import { Link } from "react-router";
import { Button } from "./ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMS = ["Fall", "Winter", "Spring/Summer"] as const;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AddToPlannerDialogProps {
  /** McMaster subject code, e.g. "COMPSCI" */
  subject: string;
  /** McMaster course number, e.g. "2C03" */
  courseNumber: string;
  /** Optional display name shown in the dialog subtitle */
  courseName?: string | null;
  /**
   * Custom trigger element. If omitted a default "Add to Planner" button is
   * rendered. Pass your own <Button> or <Badge> etc. to customise the trigger.
   */
  trigger?: React.ReactNode;
  /** Called after the course is successfully added to the plan */
  onAdded?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddToPlannerDialog({
  subject,
  courseNumber,
  courseName,
  trigger,
  onAdded,
}: AddToPlannerDialogProps) {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState<string>("Fall");
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to defaults whenever the dialog opens fresh
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Let the close animation finish before resetting state
      setTimeout(() => {
        setAdded(false);
        setError(null);
      }, 200);
    }
  };

  const handleAdd = async () => {
    if (!user) return;
    setAdding(true);
    setError(null);

    const yearIndex = year - CURRENT_YEAR + 1;
    const season = term === "Spring/Summer" ? "Spring" : term;

    try {
      const res = await authFetch(`/api/users/${user.userID}/plan`, {
        method: "POST",
        body: JSON.stringify({
          subject,
          course_number: courseNumber,
          year_index: yearIndex,
          season,
          status: "PLANNED",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server returned ${res.status}`);
      }

      setAdded(true);
      onAdded?.();

      // Auto-close after briefly showing the success tick
      setTimeout(() => handleOpenChange(false), 1400);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add course");
    } finally {
      setAdding(false);
    }
  };

  // Don't render anything for unauthenticated users
  if (!user) return null;

  const defaultTrigger = (
    <Button size="sm">
      <CalendarPlus className="h-4 w-4 mr-2" />
      Add to Planner
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? defaultTrigger}
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Degree Plan</DialogTitle>
          <DialogDescription asChild>
            <span>
              Choose when you plan to take{" "}
              <span className="font-semibold text-foreground">
                {subject} {courseNumber}
              </span>
              {courseName && (
                <>
                  <br />
                  <span className="text-xs">{courseName}</span>
                </>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        {added ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="h-7 w-7 text-green-500" />
            </div>
            <p className="text-sm font-medium">Added to your plan!</p>
            <Button asChild variant="outline" size="sm" className="mt-1">
              <Link to="/planner">View Degree Planner →</Link>
            </Button>
          </div>
        ) : (
          /* ── Form state ── */
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="atp-term">Term</Label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger id="atp-term">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERMS.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="atp-year">Academic Year</Label>
              <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger id="atp-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}–{y + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}

            <Button
              className="w-full"
              onClick={handleAdd}
              disabled={adding}
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {adding ? "Adding…" : "Add to Plan"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
