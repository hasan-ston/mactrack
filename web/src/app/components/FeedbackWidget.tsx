import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { cn } from "./ui/utils";
import { useLocation } from "react-router";
import { apiUrl } from "../lib/api";
import { toast } from "sonner";

type SubmitState = "idle" | "sending" | "sent";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      // Brief delay so the closing animation isn't jarring
      const t = setTimeout(() => {
        if (submitState === "sent") {
          setMessage("");
          setEmail("");
          setSubmitState("idle");
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, submitState]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || submitState !== "idle") return;

    setSubmitState("sending");
    try {
      const res = await fetch(apiUrl("/api/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          email: email.trim() || undefined,
          page: location.pathname,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unexpected error");
      }

      setSubmitState("sent");
    } catch (err) {
      setSubmitState("idle");
      toast.error("Couldn't send feedback — please try again.");
      console.error("[feedback]", err);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Popover panel */}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            "w-80 rounded-xl border bg-card text-card-foreground shadow-xl",
            "animate-in fade-in-0 slide-in-from-bottom-4 duration-200",
          )}
          role="dialog"
          aria-label="Send feedback"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div>
              <p className="text-sm font-semibold leading-none">Send feedback</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suggestions, bugs, or ideas — we read every one.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 -mr-1"
              onClick={() => setOpen(false)}
              aria-label="Close feedback panel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Body */}
          {submitState === "sent" ? (
            <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" strokeWidth={1.5} />
              <p className="text-sm font-medium">Thanks for your feedback!</p>
              <p className="text-xs text-muted-foreground">
                We appreciate you taking the time to help improve MacTrack.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="feedback-message" className="text-xs font-medium">
                  Message <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="feedback-message"
                  placeholder="What could be better? Found a bug? Let us know…"
                  className="min-h-[96px] text-sm resize-none"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={2000}
                  required
                  disabled={submitState === "sending"}
                  autoFocus
                />
                <p className="text-right text-[10px] text-muted-foreground">
                  {message.length}/2000
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="feedback-email" className="text-xs font-medium">
                  Your email{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="feedback-email"
                  type="email"
                  placeholder="you@example.com"
                  className="h-8 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitState === "sending"}
                />
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Include your email if you'd like a follow-up.
                </p>
              </div>

              <Button
                type="submit"
                size="sm"
                className="w-full bg-[#7A003C] hover:bg-[#5a0028] text-white"
                disabled={!message.trim() || submitState === "sending"}
              >
                {submitState === "sending" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Send Feedback
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Give feedback"
        aria-expanded={open}
        title="Give us feedback"
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium shadow-md",
          "bg-[#7A003C] text-white hover:bg-[#5a0028]",
          "transition-all duration-200 hover:shadow-lg",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A003C] focus-visible:ring-offset-2",
          open && "bg-[#5a0028]",
        )}
      >
        <MessageCircle className="h-3.5 w-3.5 shrink-0" />
        <span>Feedback</span>
      </button>
    </div>
  );
}
