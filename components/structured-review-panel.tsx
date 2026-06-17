"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  ListPlus,
  Pencil,
  Plus,
  TableProperties,
  Trash2,
} from "lucide-react";

export type ReviewTone = "good" | "warning" | "sensitive" | "manual";

export type ReviewItem = {
  id: string;
  title: string;
  meta: string;
  detail: string;
  status: "confirmed" | "needs_review" | "draft" | "protected";
};

export type ReviewSection = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  tone: ReviewTone;
  items: ReviewItem[];
};

function statusLabel(status: ReviewItem["status"]) {
  if (status === "confirmed") {
    return "Confirmed";
  }

  if (status === "protected") {
    return "Protect detail";
  }

  if (status === "needs_review") {
    return "Needs review";
  }

  return "Draft";
}

function toneClasses(tone: ReviewTone) {
  if (tone === "warning") {
    return "border-clay/25 bg-clay/10 text-clay";
  }

  if (tone === "sensitive") {
    return "border-tide/25 bg-tide/10 text-tide";
  }

  if (tone === "manual") {
    return "border-ink/15 bg-paper text-ink/65";
  }

  return "border-moss/25 bg-moss/10 text-moss";
}

function itemStatusClasses(status: ReviewItem["status"]) {
  if (status === "confirmed") {
    return "bg-moss/10 text-moss";
  }

  if (status === "protected") {
    return "bg-tide/10 text-tide";
  }

  if (status === "needs_review") {
    return "bg-clay/10 text-clay";
  }

  return "bg-ink/10 text-ink/55";
}

function makeLocalItem(section: ReviewSection, item: ReviewItem) {
  return {
    id: `${section.id}-local-${crypto.randomUUID()}`,
    title:
      section.id === "manual"
        ? "New manual addition"
        : `New ${section.title.toLowerCase()} item`,
    meta: "Local draft",
    detail: `Added near ${item.title}. This is temporary review UI state and does not persist yet.`,
    status: "draft" as const,
  };
}

export function StructuredReviewPanel({
  initialSections,
}: {
  initialSections: ReviewSection[];
}) {
  const [sections, setSections] = useState(initialSections);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  function updateItem(
    sectionId: string,
    itemId: string,
    update: Partial<ReviewItem>
  ) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.map((item) =>
                item.id === itemId ? { ...item, ...update } : item
              ),
            }
          : section
      )
    );
  }

  function deleteItem(sectionId: string, itemId: string) {
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              items: section.items.filter((item) => item.id !== itemId),
            }
          : section
      )
    );
  }

  function addItem(sectionId: string, itemId: string) {
    setSections((current) =>
      current.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        const target = section.items.find((item) => item.id === itemId);

        if (!target) {
          return section;
        }

        return {
          ...section,
          items: [...section.items, makeLocalItem(section, target)],
        };
      })
    );
  }

  const totalItems = sections.reduce(
    (sum, section) => sum + section.items.length,
    0
  );
  const needsReview = sections.reduce(
    (sum, section) =>
      sum +
      section.items.filter(
        (item) => item.status === "needs_review" || item.status === "protected"
      ).length,
    0
  );
  const confirmed = sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => item.status === "confirmed").length,
    0
  );

  return (
    <>
      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <TableProperties className="text-moss" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">{totalItems}</p>
          <p className="mt-1 text-sm text-ink/60">Reviewable records</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <CheckCircle2 className="text-moss" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">{confirmed}</p>
          <p className="mt-1 text-sm text-ink/60">Marked confirmed</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <AlertTriangle className="text-clay" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">{needsReview}</p>
          <p className="mt-1 text-sm text-ink/60">Need review or protection</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-white p-5">
          <ListPlus className="text-tide" size={22} />
          <p className="mt-4 text-3xl font-semibold text-ink">Local</p>
          <p className="mt-1 text-sm text-ink/60">Temporary review state</p>
        </div>
      </section>

      <section className="mt-8 space-y-6">
        {sections.map((section) => (
          <section
            className="rounded-md border border-ink/10 bg-white p-5"
            key={section.id}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">
                  {section.eyebrow}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  {section.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
                  {section.summary}
                </p>
              </div>
              <span
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${toneClasses(
                  section.tone
                )}`}
              >
                {section.items.length} item
                {section.items.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {section.items.map((item) => {
                const isEditing = editingItemId === item.id;

                return (
                  <article
                    className="rounded-md border border-ink/10 bg-paper p-4"
                    key={item.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            aria-label={`Edit title for ${item.title}`}
                            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm font-semibold text-ink"
                            value={item.title}
                            onChange={(event) =>
                              updateItem(section.id, item.id, {
                                title: event.target.value,
                              })
                            }
                          />
                        ) : (
                          <p className="text-sm font-semibold text-ink">
                            {item.title}
                          </p>
                        )}
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
                          {item.meta}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-sm px-2 py-1 text-xs font-semibold ${itemStatusClasses(
                          item.status
                        )}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </div>

                    {isEditing ? (
                      <textarea
                        aria-label={`Edit detail for ${item.title}`}
                        className="mt-3 min-h-24 w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm leading-6 text-ink/70"
                        value={item.detail}
                        onChange={(event) =>
                          updateItem(section.id, item.id, {
                            detail: event.target.value,
                          })
                        }
                      />
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-ink/60">
                        {item.detail}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        aria-label={`Edit item: ${item.title}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink/10 bg-white text-ink/55 transition hover:border-moss/30 hover:text-moss"
                        title={isEditing ? "Done editing" : "Edit item"}
                        type="button"
                        onClick={() =>
                          setEditingItemId(isEditing ? null : item.id)
                        }
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        aria-label={`Add item near: ${item.title}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink/10 bg-white text-ink/55 transition hover:border-moss/30 hover:text-moss"
                        title="Add item"
                        type="button"
                        onClick={() => addItem(section.id, item.id)}
                      >
                        <Plus size={15} />
                      </button>
                      <button
                        aria-label={`Delete item: ${item.title}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink/10 bg-white text-ink/55 transition hover:border-clay/30 hover:text-clay"
                        title="Delete item"
                        type="button"
                        onClick={() => deleteItem(section.id, item.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                      <button
                        aria-label={`Mark as confirmed: ${item.title}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink/10 bg-white text-ink/55 transition hover:border-moss/30 hover:text-moss"
                        title="Mark as confirmed"
                        type="button"
                        onClick={() =>
                          updateItem(section.id, item.id, {
                            status: "confirmed",
                          })
                        }
                      >
                        <CheckCircle2 size={15} />
                      </button>
                      <button
                        aria-label={`Flag as needs review: ${item.title}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-ink/10 bg-white text-ink/55 transition hover:border-clay/30 hover:text-clay"
                        title="Flag as needs review"
                        type="button"
                        onClick={() =>
                          updateItem(section.id, item.id, {
                            status: "needs_review",
                          })
                        }
                      >
                        <Flag size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </section>
    </>
  );
}
