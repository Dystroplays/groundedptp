import { useState } from "react";
import { Plus, Check, ArrowUpRight, X } from "lucide-react";
import { usePortal } from "./store";
import { Button, Field } from "./ui";
import { TemplateFields } from "./proposal-ui";
const blank: Record<string, any> = {
  videos: {
    title: "",
    playbackId: "",
    durationSec: 360,
    whyLine: "",
    category: "pre_visit",
    captionsReady: false,
    archived: false,
  },
  exercises: { name: "", defaultCue: "", tags: [], archived: false },
  quizzes: {
    videoId: "",
    questions: [
      { prompt: "", options: ["", ""], correctIndex: 0, jumpToSec: 0 },
    ],
  },
  sequences: { name: "", active: false, items: [] },
  proposalTemplates: {
    name: "",
    condition: "knee",
    weeks: 8,
    visitsPerWeek: 2,
    why: "",
    programmingFocus: "",
    outcomes: [],
    phases: [],
    included: [],
    priceCents: 440000,
    active: true,
  },
};
export function Library() {
  const p = usePortal(),
    [table, setTable] = useState("videos"),
    [id, setId] = useState(""),
    [value, setValue] = useState<any>(structuredClone(blank.videos)),
    [saved, setSaved] = useState(false);
  const update = (key: string, v: any) => {
    setValue((old: any) => ({ ...old, [key]: v }));
    setSaved(false);
  };
  const rows =
      p.adminData[table === "proposalTemplates" ? "templates" : table] ?? [],
    videos = p.adminData.videos;
  return (
    <div className="patient-columns library-layout">
      <section className="section">
        <div className="section-top">
          <h2>Content library</h2>
          <select
            aria-label="Library type"
            value={table}
            onChange={(e) => {
              setTable(e.target.value);
              setId("");
              setValue(structuredClone(blank[e.target.value]));
              setSaved(false);
            }}
          >
            {[
              ["videos", "Videos"],
              ["exercises", "Exercises"],
              ["quizzes", "Quizzes"],
              ["sequences", "Sequences"],
              ["proposalTemplates", "Condition templates"],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {rows.map((r: any) => (
          <button
            className="catalog-row"
            key={r._id}
            onClick={() => {
              setId(r._id);
              const { _id, _creationTime, ...record } = r;
              setValue(structuredClone(record));
              setSaved(false);
            }}
          >
            <strong>
              {r.title ??
                r.name ??
                videos.find((v: any) => v._id === r.videoId)?.title ??
                "Quiz"}
            </strong>
            <ArrowUpRight size={17} />
          </button>
        ))}
        <Button
          className="outline"
          onClick={() => {
            setId("");
            setValue(structuredClone(blank[table]));
          }}
        >
          <Plus size={17} />
          New entry
        </Button>
      </section>
      <section className="section">
        <h2>{id ? "Edit library entry" : "Create library entry"}</h2>
        <div className="section">
          {["videos", "exercises", "sequences", "proposalTemplates"].includes(
            table,
          ) && (
            <Field label={table === "videos" ? "Title" : "Name"}>
              <input
                value={value.title ?? value.name ?? ""}
                onChange={(e) =>
                  update(table === "videos" ? "title" : "name", e.target.value)
                }
              />
            </Field>
          )}
          {table === "videos" && (
            <>
              <Field label="Mux playback ID">
                <input
                  value={value.playbackId}
                  onChange={(e) => update("playbackId", e.target.value)}
                />
              </Field>
              <Field label="Length (seconds)">
                <input
                  type="number"
                  min="1"
                  value={value.durationSec}
                  onChange={(e) =>
                    update("durationSec", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Why this matters to the patient">
                <textarea
                  rows={3}
                  value={value.whyLine}
                  onChange={(e) => update("whyLine", e.target.value)}
                />
              </Field>
              <Field label="Category">
                <select
                  value={value.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  <option value="pre_visit">Pre-visit</option>
                  <option value="exercise">Exercise</option>
                </select>
              </Field>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={value.captionsReady}
                  onChange={(e) => update("captionsReady", e.target.checked)}
                />
                Captions uploaded and verified
              </label>
            </>
          )}
          {table === "exercises" && (
            <>
              <Field label="Default movement cue">
                <textarea
                  rows={3}
                  value={value.defaultCue}
                  onChange={(e) => update("defaultCue", e.target.value)}
                />
              </Field>
              <Field label="Tags (comma-separated)">
                <input
                  value={value.tags.join(", ")}
                  onChange={(e) =>
                    update(
                      "tags",
                      e.target.value.split(",").map((s) => s.trim()),
                    )
                  }
                />
              </Field>
            </>
          )}
          {["exercises", "quizzes"].includes(table) && (
            <Field label="Video">
              <select
                value={value.videoId ?? ""}
                onChange={(e) => update("videoId", e.target.value || undefined)}
              >
                <option value="">Choose a video</option>
                {videos.map((v: any) => (
                  <option key={v._id} value={v._id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {table === "quizzes" && (
            <>
              {value.questions.map((q: any, index: number) => {
                const change = (key: string, v: any) =>
                  update(
                    "questions",
                    value.questions.map((old: any, i: number) =>
                      i === index ? { ...old, [key]: v } : old,
                    ),
                  );
                return (
                  <div className="quiz-editor" key={index}>
                    <h3>Question {index + 1}</h3>
                    <Field label="Question">
                      <textarea
                        value={q.prompt}
                        onChange={(e) => change("prompt", e.target.value)}
                      />
                    </Field>
                    {q.options.map((option: string, i: number) => (
                      <Field key={i} label={`Answer ${i + 1}`}>
                        <input
                          value={option}
                          onChange={(e) =>
                            change(
                              "options",
                              q.options.map((old: string, n: number) =>
                                n === i ? e.target.value : old,
                              ),
                            )
                          }
                        />
                      </Field>
                    ))}
                    <Button
                      className="outline small-button"
                      onClick={() => change("options", [...q.options, ""])}
                    >
                      Add answer
                    </Button>
                    <Field label="Correct answer">
                      <select
                        value={q.correctIndex}
                        onChange={(e) =>
                          change("correctIndex", Number(e.target.value))
                        }
                      >
                        {q.options.map((_: string, i: number) => (
                          <option value={i} key={i}>
                            Answer {i + 1}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Replay timestamp (seconds)">
                      <input
                        type="number"
                        min="0"
                        value={q.jumpToSec}
                        onChange={(e) =>
                          change("jumpToSec", Number(e.target.value))
                        }
                      />
                    </Field>
                  </div>
                );
              })}
              <Button
                className="outline"
                onClick={() =>
                  update("questions", [
                    ...value.questions,
                    {
                      prompt: "",
                      options: ["", ""],
                      correctIndex: 0,
                      jumpToSec: 0,
                    },
                  ])
                }
              >
                Add question
              </Button>
            </>
          )}
          {table === "sequences" && (
            <>
              {value.items.map((item: any, index: number) => (
                <div className="sequence-editor" key={index}>
                  <Field label={`Video ${index + 1}`}>
                    <select
                      value={item.videoId}
                      onChange={(e) =>
                        update(
                          "items",
                          value.items.map((old: any, i: number) =>
                            i === index
                              ? { ...old, videoId: e.target.value }
                              : old,
                          ),
                        )
                      }
                    >
                      <option value="">Choose a video</option>
                      {videos.map((v: any) => (
                        <option value={v._id} key={v._id}>
                          {v.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Due this many days before evaluation">
                    <input
                      type="number"
                      min="1"
                      value={item.dueOffsetDays}
                      onChange={(e) =>
                        update(
                          "items",
                          value.items.map((old: any, i: number) =>
                            i === index
                              ? {
                                  ...old,
                                  dueOffsetDays: Number(e.target.value),
                                }
                              : old,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Button
                    className="outline small-button"
                    onClick={() =>
                      update(
                        "items",
                        value.items.filter((_: any, i: number) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                className="outline"
                onClick={() =>
                  update("items", [
                    ...value.items,
                    { videoId: videos[0]?._id ?? "", dueOffsetDays: 1 },
                  ])
                }
              >
                Add video
              </Button>
              <label className="choice section">
                <input
                  type="checkbox"
                  checked={value.active}
                  onChange={(e) => update("active", e.target.checked)}
                />
                Use this sequence for new evaluations
              </label>
            </>
          )}
          {table === "proposalTemplates" && (
            <TemplateFields value={value} update={update} />
          )}
          {["videos", "exercises"].includes(table) && (
            <label className="choice">
              <input
                type="checkbox"
                checked={value.archived}
                onChange={(e) => update("archived", e.target.checked)}
              />
              Archive this entry
            </label>
          )}
          <div className="section">
            <Button
              onClick={async () => {
                await p.adminCommand("catalog", {
                  table,
                  ...(id ? { id } : {}),
                  data: value,
                });
                setSaved(true);
              }}
            >
              Save library entry <Check size={17} />
            </Button>
            {saved && (
              <p role="status" className="notice success section">
                Library entry saved.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
