"use client";

import { useRef, useState, type ReactNode } from "react";

export function ReviewDecisionInlineForm({
  action,
  actionUrl,
  answerValue,
  buttonClassName,
  children,
  extraFields,
  saveLabel = "Saved",
  subjectId,
  subjectIds,
  subjectType,
}: {
  action: "answer_question" | "confirm" | "delete" | "protect";
  actionUrl: string;
  answerValue?: string;
  buttonClassName: string;
  children: ReactNode;
  extraFields?: ReactNode;
  saveLabel?: string;
  subjectId: string;
  subjectIds?: string[];
  subjectType: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateVisibleCounts(reviewItem: HTMLElement) {
    const section = reviewItem.closest("[data-review-section]");
    const sectionCount = section?.querySelector("[data-review-section-count]");
    const totalCount = document.querySelector("[data-review-total-count]");

    [sectionCount, totalCount].forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const count = Number(element.dataset.count ?? "");

      if (!Number.isFinite(count) || count <= 0) {
        return;
      }

      const noun = element.dataset.countNoun ?? "item";
      const plural = element.dataset.countPlural ?? `${noun}s`;
      const suffix = element.dataset.countSuffix ?? "";
      const nextCount = count - 1;
      const countText =
        nextCount === 0 && element.dataset.zeroLabel
          ? element.dataset.zeroLabel
          : `${nextCount} ${nextCount === 1 ? noun : plural}${suffix}`;
      const label = element.querySelector("[data-review-count-label]");

      element.dataset.count = String(nextCount);

      if (label instanceof HTMLElement) {
        label.textContent = countText;
      } else {
        element.textContent = countText;
      }
    });
  }

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

          setSaved(true);

          const reviewItem = form.closest("[data-review-item]");

          if (reviewItem instanceof HTMLElement) {
            reviewItem.dataset.reviewItemSaved = "true";
            updateVisibleCounts(reviewItem);
            window.setTimeout(() => {
              reviewItem.hidden = true;
            }, 650);
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
      {extraFields}
      <button
        className={buttonClassName}
        disabled={isSubmitting || saved}
        type="submit"
      >
        {saved ? saveLabel : children}
      </button>
      {failed ? (
        <p className="mt-2 text-xs font-semibold text-clay">
          Could not save. Try again.
        </p>
      ) : null}
      {saved ? (
        <p className="mt-2 text-xs font-semibold text-moss">
          Saved
        </p>
      ) : null}
    </form>
  );
}
