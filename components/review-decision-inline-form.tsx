"use client";

import { useRef, useState, type ReactNode } from "react";

export function ReviewDecisionInlineForm({
  action,
  actionUrl,
  answerValue,
  buttonClassName,
  children,
  subjectId,
  subjectIds,
  subjectType,
}: {
  action: "answer_question" | "confirm" | "delete" | "protect";
  actionUrl: string;
  answerValue?: string;
  buttonClassName: string;
  children: ReactNode;
  subjectId: string;
  subjectIds?: string[];
  subjectType: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <form
      action={actionUrl}
      method="post"
      onSubmit={async (event) => {
        event.preventDefault();
        setFailed(false);
        setIsSubmitting(true);

        try {
          const form = formRef.current;

          if (!form) {
            throw new Error("Decision form is missing.");
          }

          const response = await fetch(actionUrl, {
            body: new FormData(form),
            headers: {
              accept: "application/json",
            },
            method: "POST",
          });
          const result = (await response.json().catch(() => null)) as {
            ok?: boolean;
          } | null;

          if (!response.ok || result?.ok !== true) {
            throw new Error("Decision save failed.");
          }

          const reviewItem = form.closest("[data-review-item]");

          if (reviewItem instanceof HTMLElement) {
            reviewItem.hidden = true;
          }
        } catch {
          setFailed(true);
        } finally {
          setIsSubmitting(false);
        }
      }}
      ref={formRef}
    >
      <input name="action" type="hidden" value={action} />
      <input name="subjectId" type="hidden" value={subjectId} />
      <input name="subjectType" type="hidden" value={subjectType} />
      {subjectIds && subjectIds.length > 0 ? (
        <input name="subjectIds" type="hidden" value={subjectIds.join(",")} />
      ) : null}
      {answerValue ? (
        <input name="answerValue" type="hidden" value={answerValue} />
      ) : null}
      <button
        className={buttonClassName}
        disabled={isSubmitting}
        type="submit"
      >
        {children}
      </button>
      {failed ? (
        <p className="mt-2 text-xs font-semibold text-clay">
          Could not save. Try again.
        </p>
      ) : null}
    </form>
  );
}
