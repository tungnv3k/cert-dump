import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  GraduationCap,
  Layers,
  ListChecks,
  Loader2,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const API_BASE = "/api";

async function apiRequest(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (data?.error) errorMessage = data.error;
    } catch {
      // response had no JSON body; keep the generic message
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) return null;
  return response.json();
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function parseRows(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    const characterCode = character.charCodeAt(0);
    const nextCode = next?.charCodeAt(0);
    const isLineBreak = characterCode === 10 || characterCode === 13;
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
    } else if (isLineBreak && !quoted) {
      if (characterCode === 13 && nextCode === 10) index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted value.");

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function detectCsvDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return commaCount > semicolonCount ? "," : ";";
}

function normalizeQuestion(question, index) {
  if (
    !question?.question ||
    !Array.isArray(question.options) ||
    question.options.length < 2
  ) {
    throw new Error(`Invalid question ${index + 1}.`);
  }

  const rawCorrect = Array.isArray(question.correctAnswers)
    ? question.correctAnswers
    : Array.isArray(question.answer)
      ? question.answer
      : [question.answer];

  const correctAnswers = [
    ...new Set(
      rawCorrect
        .map(Number)
        .filter(
          (answer) =>
            Number.isInteger(answer) &&
            answer >= 0 &&
            answer < question.options.length,
        ),
    ),
  ].sort((a, b) => a - b);

  if (!correctAnswers.length) {
    throw new Error(`Invalid answer for question ${index + 1}.`);
  }

  const options = question.options.map((option) => String(option).trim());
  if (options.some((option) => !option)) {
    throw new Error(`Question ${index + 1} contains an empty option.`);
  }

  return {
    question: String(question.question).trim(),
    options,
    correctAnswers,
    multiple: correctAnswers.length > 1,
    explanation: String(question.explanation || "").trim(),
  };
}

function normalizeQuiz(data, fallbackTitle) {
  const source = Array.isArray(data)
    ? { title: fallbackTitle, questions: data }
    : data;

  if (!source || !Array.isArray(source.questions) || !source.questions.length) {
    throw new Error("Question bank has no questions.");
  }

  return {
    title: String(source.title || fallbackTitle || "Untitled quiz").trim(),
    description: String(source.description || "Imported question bank").trim(),
    questions: source.questions.map(normalizeQuestion),
  };
}

function parseCsv(text, filename) {
  const cleanText = text.replace(/^\uFEFF/, "");
  const rows = parseRows(cleanText, detectCsvDelimiter(cleanText));
  if (rows.length < 2) throw new Error("CSV has no question rows.");

  const headers = rows[0].map((header) => header.toLowerCase().trim());
  const questionColumn = headers.indexOf("question");
  const answersColumn = headers.indexOf("answers");
  const correctColumn = headers.indexOf("correct answers");

  if (questionColumn < 0 || answersColumn < 0 || correctColumn < 0) {
    throw new Error(
      'Required columns: "question", "answers", and "correct answers".',
    );
  }

  const questions = rows
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map((cells, rowIndex) => {
      const questionText = cells[questionColumn]?.trim();
      const rawAnswers = cells[answersColumn]?.trim();
      const rawCorrect = cells[correctColumn]?.trim();

      if (!questionText || !rawAnswers || !rawCorrect) {
        throw new Error(`Missing data on CSV row ${rowIndex + 2}.`);
      }

      const options = rawAnswers
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const match = item.match(/^([A-Z])\.\s*(.+)$/i);
          if (!match) {
            throw new Error(
              `Invalid answer format on CSV row ${rowIndex + 2}.`,
            );
          }
          return { key: match[1].toUpperCase(), text: match[2].trim() };
        });

      if (options.length < 2) {
        throw new Error(`CSV row ${rowIndex + 2} needs at least two answers.`);
      }

      const optionKeys = options.map((option) => option.key);
      if (new Set(optionKeys).size !== optionKeys.length) {
        throw new Error(`Duplicate answer letters on CSV row ${rowIndex + 2}.`);
      }

      const correctAnswers = [
        ...new Set(
          rawCorrect
            .split(",")
            .map((key) => key.trim().toUpperCase())
            .filter(Boolean)
            .map((key) => {
              const answerIndex = options.findIndex(
                (option) => option.key === key,
              );
              if (answerIndex < 0) {
                throw new Error(
                  `Correct answer ${key} was not found on CSV row ${rowIndex + 2}.`,
                );
              }
              return answerIndex;
            }),
        ),
      ].sort((a, b) => a - b);

      return normalizeQuestion(
        {
          question: questionText,
          options: options.map((option) => option.text),
          correctAnswers,
        },
        rowIndex,
      );
    });

  return {
    title: filename.replace(/\.csv$/i, ""),
    description: `Imported from ${filename}`,
    questions,
  };
}

function mergeBanksIntoQuiz(selectedBanks, title) {
  const questions = selectedBanks.flatMap((bank) =>
    bank.questions.map(
      ({ question, options, correctAnswers, multiple, explanation }) => ({
        question,
        options,
        correctAnswers,
        multiple,
        explanation,
      }),
    ),
  );

  return {
    title: title.trim() || "Untitled quiz",
    description:
      selectedBanks.length === 1
        ? selectedBanks[0].description
        : `Combined from ${selectedBanks.map((bank) => bank.title).join(", ")}`,
    questions,
  };
}

function answersMatch(selected = [], correct = []) {
  const left = [...selected].sort((a, b) => a - b);
  const right = [...correct].sort((a, b) => a - b);
  return (
    left.length === right.length &&
    left.every((answer, index) => answer === right[index])
  );
}

function ResultStat({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function TopNav({ screen, onNavigate }) {
  const tabs = [
    { id: "banks", label: "Question banks", icon: Layers },
    { id: "quizzes", label: "Quizzes", icon: ListChecks },
  ];

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onNavigate(tab.id)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            screen === tab.id
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <tab.icon className="size-4" aria-hidden="true" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function QuizPlatform() {
  const [banks, setBanks] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("banks");
  const [activeQuizId, setActiveQuizId] = useState(null);
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState(null);
  const [importing, setImporting] = useState(false);
  const [selectedBankIds, setSelectedBankIds] = useState(() => new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [quizDraftTitle, setQuizDraftTitle] = useState("");
  const inputRef = useRef(null);

  const activeQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.id === activeQuizId) || null,
    [quizzes, activeQuizId],
  );

  const selectedBanks = useMemo(
    () => banks.filter((bank) => selectedBankIds.has(bank.id)),
    [banks, selectedBankIds],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedBanks, loadedQuizzes] = await Promise.all([
        apiRequest("/banks"),
        apiRequest("/quizzes"),
      ]);
      setBanks(loadedBanks);
      setQuizzes(loadedQuizzes);
      setMessage(null);
    } catch (error) {
      setMessage({
        type: "error",
        title: "Couldn't load your data",
        text: error.message,
        retry: loadData,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function runImport(files) {
    setImporting(true);

    try {
      const imported = [];
      for (const file of files) {
        const text = await file.text();
        const lowerName = file.name.toLowerCase();

        if (lowerName.endsWith(".csv")) {
          imported.push(parseCsv(text, file.name));
        } else if (lowerName.endsWith(".json")) {
          const data = JSON.parse(text);
          if (Array.isArray(data.quizzes)) {
            imported.push(
              ...data.quizzes.map((bank) => normalizeQuiz(bank, file.name)),
            );
          } else {
            imported.push(
              normalizeQuiz(data, file.name.replace(/\.json$/i, "")),
            );
          }
        } else {
          throw new Error(`${file.name} is not a CSV or JSON file.`);
        }
      }

      const created = await apiRequest("/banks", {
        method: "POST",
        body: JSON.stringify(imported),
      });

      setBanks((current) => [...current, ...created]);
      setMessage({
        type: "success",
        title: "Import complete",
        text: `${created.length} question bank${created.length === 1 ? "" : "s"} added.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        title: "Import failed",
        text:
          error instanceof Error ? error.message : "Unable to import files.",
        retry: () => runImport(files),
      });
    } finally {
      setImporting(false);
    }
  }

  async function importFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    await runImport(files);
  }

  function toggleBankSelection(bankId) {
    setSelectedBankIds((current) => {
      const next = new Set(current);
      if (next.has(bankId)) next.delete(bankId);
      else next.add(bankId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedBankIds((current) =>
      current.size === banks.length
        ? new Set()
        : new Set(banks.map((bank) => bank.id)),
    );
  }

  async function deleteBank(bankId) {
    try {
      await apiRequest(`/banks/${bankId}`, { method: "DELETE" });
      setBanks((current) => current.filter((bank) => bank.id !== bankId));
      setSelectedBankIds((current) => {
        if (!current.has(bankId)) return current;
        const next = new Set(current);
        next.delete(bankId);
        return next;
      });
    } catch (error) {
      setMessage({
        type: "error",
        title: "Delete failed",
        text: error.message,
        retry: () => deleteBank(bankId),
      });
    }
  }

  function openCreateDialog() {
    if (!selectedBanks.length) return;
    setQuizDraftTitle(
      selectedBanks.length === 1
        ? selectedBanks[0].title
        : selectedBanks.map((bank) => bank.title).join(" + "),
    );
    setCreateDialogOpen(true);
  }

  async function confirmCreateQuiz() {
    if (!selectedBanks.length) return;
    const draft = mergeBanksIntoQuiz(selectedBanks, quizDraftTitle);

    try {
      const created = await apiRequest("/quizzes", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      setQuizzes((current) => [...current, created]);
      setSelectedBankIds(new Set());
      setCreateDialogOpen(false);
      setScreen("quizzes");
      setMessage({
        type: "success",
        title: "Quiz created",
        text: `"${created.title}" is ready with ${created.questions.length} questions.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        title: "Couldn't create quiz",
        text: error.message,
        retry: () => confirmCreateQuiz(),
      });
    }
  }

  function openQuiz(quiz) {
    setActiveQuizId(quiz.id);
    setScreen("detail");
  }

  async function deleteQuiz(quizId) {
    try {
      await apiRequest(`/quizzes/${quizId}`, { method: "DELETE" });
      setQuizzes((current) => current.filter((quiz) => quiz.id !== quizId));
      if (activeQuizId === quizId) {
        setActiveQuizId(null);
        setScreen("quizzes");
      }
    } catch (error) {
      setMessage({
        type: "error",
        title: "Delete failed",
        text: error.message,
        retry: () => deleteQuiz(quizId),
      });
    }
  }

  function start(mode) {
    if (!activeQuiz) return;
    setSession({
      mode,
      questions: shuffle(activeQuiz.questions),
      current: 0,
      answers: {},
      checked: {},
      finished: false,
    });
    setScreen("play");
  }

  function exitPlayer() {
    setSession(null);
    setScreen(activeQuiz ? "detail" : "quizzes");
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <div className="sr-only" aria-live="polite">
        {message?.text}
      </div>

      {(screen === "banks" || screen === "quizzes") && (
        <main className="mx-auto w-full max-w-6xl px-4 py-8 pb-28 sm:px-6 lg:py-12">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-primary p-2 text-primary-foreground">
                  <GraduationCap className="size-6" aria-hidden="true" />
                </span>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                  Quiz Studio
                </h1>
              </div>
              <p className="text-muted-foreground">
                Import CSV or JSON question banks, select the ones you want,
                and combine them into a quiz.
              </p>
            </div>

            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              multiple
              accept=".csv,.json,application/json,text/csv"
              onChange={importFiles}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={importing}
            >
              <FileUp className="mr-2 size-4" aria-hidden="true" />
              {importing ? "Importing..." : "Import CSV/JSON"}
            </Button>
          </header>

          <div className="mt-6">
            <TopNav screen={screen} onNavigate={setScreen} />
          </div>

          {message && (
            <Alert
              variant={message.type === "error" ? "destructive" : "default"}
              className={
                message.type === "success"
                  ? "mt-6 border-emerald-600/40 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
                  : "mt-6"
              }
            >
              {message.type === "error" ? (
                <AlertCircle className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              <AlertTitle>{message.title}</AlertTitle>
              <AlertDescription>{message.text}</AlertDescription>
              {message.retry && (
                <AlertAction>
                  <Button variant="outline" size="sm" onClick={message.retry}>
                    <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" />
                    Retry
                  </Button>
                </AlertAction>
              )}
            </Alert>
          )}

          {loading && (
            <div className="mt-8 flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
              <p className="text-sm">Loading your data from MongoDB…</p>
            </div>
          )}

          {!loading && screen === "banks" &&
            (!banks.length ? (
              <Card className="mt-8 border-dashed">
                <CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                  <Layers className="size-10 text-muted-foreground" />
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">
                      No question banks yet
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Import one or more files to begin. Each file becomes
                      its own question bank.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => inputRef.current?.click()}
                  >
                    Choose files
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="mt-8 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Select one or more question banks, then create a quiz.
                  </p>
                  <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                    {selectedBankIds.size === banks.length
                      ? "Clear selection"
                      : "Select all"}
                  </Button>
                </div>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {banks.map((bank) => {
                    const isSelected = selectedBankIds.has(bank.id);
                    return (
                      <Card
                        key={bank.id}
                        role="checkbox"
                        aria-checked={isSelected}
                        tabIndex={0}
                        onClick={() => toggleBankSelection(bank.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleBankSelection(bank.id);
                          }
                        }}
                        className={`flex cursor-pointer flex-col transition-colors ${
                          isSelected
                            ? "border-primary ring-1 ring-primary"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <CardHeader className="flex-1">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <Badge variant="secondary" className="w-fit">
                              {bank.questions.length} questions
                            </Badge>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() =>
                                toggleBankSelection(bank.id)
                              }
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Select ${bank.title}`}
                            />
                          </div>
                          <CardTitle>{bank.title}</CardTitle>
                          <CardDescription>{bank.description}</CardDescription>
                        </CardHeader>
                        <CardFooter className="justify-end">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label={`Delete ${bank.title}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete this question bank?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{bank.title}" and all its questions will be
                                  removed from this browser. Quizzes already
                                  created from it will not be affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => deleteBank(bank.id)}
                                >
                                  Delete bank
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </>
            ))}

          {!loading && screen === "quizzes" &&
            (!quizzes.length ? (
              <Card className="mt-8 border-dashed">
                <CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                  <ListChecks className="size-10 text-muted-foreground" />
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold">No quizzes yet</h2>
                    <p className="text-sm text-muted-foreground">
                      Select one or more question banks and create a quiz to
                      start learning or testing.
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setScreen("banks")}>
                    Go to question banks
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {quizzes.map((quiz) => (
                  <Card key={quiz.id} className="flex flex-col">
                    <CardHeader className="flex-1">
                      <Badge variant="secondary" className="mb-3 w-fit">
                        {quiz.questions.length} questions
                      </Badge>
                      <CardTitle>{quiz.title}</CardTitle>
                      <CardDescription>{quiz.description}</CardDescription>
                    </CardHeader>
                    <CardFooter className="gap-3">
                      <Button className="flex-1" onClick={() => openQuiz(quiz)}>
                        Open quiz
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Delete ${quiz.title}`}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this quiz?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{quiz.title}" will be removed from this
                              browser. The source question banks are not
                              affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteQuiz(quiz.id)}
                            >
                              Delete quiz
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ))}
        </main>
      )}

      {screen === "banks" && selectedBanks.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row sm:px-6">
            <p className="text-sm font-medium">
              {selectedBanks.length} question bank
              {selectedBanks.length === 1 ? "" : "s"} selected (
              {selectedBanks.reduce(
                (sum, bank) => sum + bank.questions.length,
                0,
              )}{" "}
              questions)
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => setSelectedBankIds(new Set())}
              >
                Clear
              </Button>
              <Button onClick={openCreateDialog}>Create quiz</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create quiz</DialogTitle>
            <DialogDescription>
              Combine {selectedBanks.length} question bank
              {selectedBanks.length === 1 ? "" : "s"} into a new quiz:{" "}
              {selectedBanks.map((bank) => bank.title).join(", ")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="quiz-title">Quiz name</Label>
            <Input
              id="quiz-title"
              autoFocus
              value={quizDraftTitle}
              onChange={(event) => setQuizDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  confirmCreateQuiz();
                }
              }}
              placeholder="e.g. Practice exam"
            />
          </div>
          <DialogFooter>
            <DialogClose>Cancel</DialogClose>
            <Button onClick={confirmCreateQuiz}>
              Create quiz (
              {selectedBanks.reduce(
                (sum, bank) => sum + bank.questions.length,
                0,
              )}{" "}
              questions)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {screen === "detail" && activeQuiz && (
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
          <Button variant="ghost" onClick={() => setScreen("quizzes")}>
            <ArrowLeft className="mr-2 size-4" />
            All quizzes
          </Button>
          <Card className="mt-5">
            <CardHeader>
              <Badge variant="secondary" className="mb-3 w-fit">
                {activeQuiz.questions.length} questions
              </Badge>
              <CardTitle className="text-3xl">{activeQuiz.title}</CardTitle>
              <CardDescription>{activeQuiz.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Learning mode gives instant feedback. Test mode shows results
                after submission.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-3 sm:flex-row">
              <Button
                className="w-full sm:w-auto"
                onClick={() => start("learn")}
              >
                Start learning
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={() => start("test")}
              >
                Start test
              </Button>
            </CardFooter>
          </Card>
        </main>
      )}

      {screen === "play" && session && activeQuiz && (
        <Player
          session={session}
          setSession={setSession}
          quiz={activeQuiz}
          onExit={exitPlayer}
        />
      )}
    </div>
  );
}

function Player({ session, setSession, quiz, onExit }) {
  const question = session.questions[session.current];
  const selected = session.answers[session.current] || [];
  const checked = Boolean(session.checked[session.current]);
  const lastQuestion = session.current === session.questions.length - 1;
  const correct = answersMatch(selected, question.correctAnswers);

  const score = useMemo(
    () =>
      session.questions.reduce(
        (total, item, index) =>
          total +
          (answersMatch(session.answers[index], item.correctAnswers) ? 1 : 0),
        0,
      ),
    [session.answers, session.questions],
  );

  const choose = useCallback(
    (index) => {
      if (session.mode === "learn" && checked) return;

      setSession((current) => {
        const active = current.questions[current.current];
        const previous = current.answers[current.current] || [];
        const next = active.multiple
          ? previous.includes(index)
            ? previous.filter((answer) => answer !== index)
            : [...previous, index].sort((a, b) => a - b)
          : [index];

        return {
          ...current,
          answers: { ...current.answers, [current.current]: next },
        };
      });
    },
    [checked, session.mode, setSession],
  );

  const move = useCallback(
    (delta) => {
      setSession((current) => ({
        ...current,
        current: Math.max(
          0,
          Math.min(current.questions.length - 1, current.current + delta),
        ),
      }));
    },
    [setSession],
  );

  function primaryAction() {
    if (session.mode === "learn" && !checked) {
      if (!selected.length) return;
      setSession((current) => ({
        ...current,
        checked: { ...current.checked, [current.current]: true },
      }));
      return;
    }

    if (lastQuestion) {
      if (session.mode === "test") {
        setSession((current) => ({ ...current, finished: true }));
      } else {
        onExit();
      }
    } else {
      move(1);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (session.finished || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if (isEditable) return;

      const answerNumber = Number(event.key);
      if (
        Number.isInteger(answerNumber) &&
        answerNumber >= 1 &&
        answerNumber <= 4 &&
        answerNumber <= question.options.length
      ) {
        event.preventDefault();
        choose(answerNumber - 1);
        return;
      }

      if (event.key === "ArrowLeft" && session.current > 0) {
        event.preventDefault();
        move(-1);
      }

      if (event.key === "ArrowRight" && !lastQuestion) {
        event.preventDefault();
        move(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [checked, choose, lastQuestion, move, question.options.length, session]);

  if (session.finished) {
    const percentage = Math.round((score / session.questions.length) * 100);
    const answeredCount = session.questions.filter(
      (_, index) => (session.answers[index] || []).length > 0,
    ).length;
    const unansweredCount = session.questions.length - answeredCount;

    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2 className="size-8" aria-hidden="true" />
            </div>
            <CardTitle className="text-3xl">Test complete</CardTitle>
            <CardDescription>{quiz.title}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <ResultStat
                label="Score"
                value={`${score}/${session.questions.length}`}
              />
              <ResultStat label="Percentage" value={`${percentage}%`} />
              <ResultStat label="Unanswered" value={unansweredCount} />
            </div>
            <section
              className="space-y-4"
              aria-labelledby="answer-review-title"
            >
              <div>
                <h2 id="answer-review-title" className="text-xl font-semibold">
                  Answer review
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review your responses and the correct answers.
                </p>
              </div>
              <div className="space-y-4">
                {session.questions.map((item, index) => {
                  const userAnswers = session.answers[index] || [];
                  const itemCorrect = answersMatch(
                    userAnswers,
                    item.correctAnswers,
                  );
                  const userAnswerText = userAnswers.length
                    ? userAnswers
                        .map((answerIndex) => item.options[answerIndex])
                        .join(", ")
                    : "No answer provided";
                  const correctAnswerText = item.correctAnswers
                    .map((answerIndex) => item.options[answerIndex])
                    .join(", ");

                  return (
                    <Card key={item.id} className="shadow-none">
                      <CardHeader className="pb-3">
                        <div className="flex items-start gap-3">
                          {itemCorrect ? (
                            <CheckCircle2
                              className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <XCircle
                              className="mt-0.5 size-5 shrink-0 text-destructive"
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0 space-y-1">
                            <Badge
                              variant={
                                itemCorrect ? "secondary" : "destructive"
                              }
                            >
                              {itemCorrect ? "Correct" : "Incorrect"}
                            </Badge>
                            <CardTitle className="text-base leading-relaxed">
                              {index + 1}. {item.question}
                            </CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <p>
                          <span className="font-medium">Your answer:</span>
                          <span className="text-muted-foreground">
                            {userAnswerText}
                          </span>
                        </p>
                        {!itemCorrect && (
                          <p>
                            <span className="font-medium">Correct answer:</span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {correctAnswerText}
                            </span>
                          </p>
                        )}
                        {item.explanation && (
                          <Alert className="mt-3">
                            <AlertTitle>Explanation</AlertTitle>
                            <AlertDescription>
                              {item.explanation}
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          </CardContent>
          <CardFooter className="flex-col justify-center gap-3 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                setSession({
                  mode: session.mode,
                  questions: shuffle(quiz.questions),
                  current: 0,
                  answers: {},
                  checked: {},
                  finished: false,
                })
              }
            >
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
              Retry test
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={onExit}
            >
              Back to quiz
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  function stateClasses(index) {
    const isSelected = selected.includes(index);
    const isCorrect = checked && question.correctAnswers.includes(index);
    const isWrong =
      checked && isSelected && !question.correctAnswers.includes(index);

    if (isCorrect) {
      return "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30";
    }
    if (isWrong) return "border-destructive bg-destructive/5";
    if (isSelected) return "border-primary bg-primary/5 ring-1 ring-primary";
    return "border-border hover:bg-muted/50";
  }

  const progress = ((session.current + 1) / session.questions.length) * 100;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onExit}>
            <ArrowLeft className="mr-2 size-4" />
            Exit
          </Button>
          <Badge variant="outline">
            {session.mode === "learn" ? "Learning mode" : "Test mode"}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              Question {session.current + 1} of {session.questions.length}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} aria-label="Quiz progress" />
        </div>
      </header>

      <Card className="mt-6">
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit">
            {question.multiple ? "Select all that apply" : "Select one answer"}
          </Badge>
          <CardTitle className="text-xl leading-relaxed sm:text-2xl">
            {question.question}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {question.multiple ? (
            <div className="space-y-3" role="group" aria-label="Answer choices">
              {question.options.map((option, index) => {
                const id = `${question.id}-${index}`;
                return (
                  <div
                    key={id}
                    className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${stateClasses(index)}`}
                  >
                    <Checkbox
                      id={id}
                      className="mt-0.5"
                      checked={selected.includes(index)}
                      disabled={session.mode === "learn" && checked}
                      onCheckedChange={() => choose(index)}
                    />
                    <Label
                      htmlFor={id}
                      className="flex-1 cursor-pointer font-normal leading-relaxed"
                    >
                      {option}
                    </Label>
                  </div>
                );
              })}
            </div>
          ) : (
            <RadioGroup
              value={selected.length ? String(selected[0]) : ""}
              onValueChange={(value) => choose(Number(value))}
              disabled={session.mode === "learn" && checked}
              className="space-y-3"
            >
              {question.options.map((option, index) => {
                const id = `${question.id}-${index}`;
                return (
                  <div
                    key={id}
                    className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${stateClasses(index)}`}
                  >
                    <RadioGroupItem
                      id={id}
                      value={String(index)}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={id}
                      className="flex-1 cursor-pointer font-normal leading-relaxed"
                    >
                      {option}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          )}

          {checked && (
            <Alert
              variant={correct ? "default" : "destructive"}
              className={
                correct
                  ? "border-emerald-600/40 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100"
                  : ""
              }
            >
              {correct ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              <AlertTitle>{correct ? "Correct" : "Incorrect"}</AlertTitle>
              <AlertDescription>
                {!correct && (
                  <span>
                    Correct answer:
                    {question.correctAnswers
                      .map((index) => question.options[index])
                      .join(", ")}
                  </span>
                )}
                {question.explanation && (
                  <span className="mt-1 block">{question.explanation}</span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <nav className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={session.current === 0}
          onClick={() => move(-1)}
        >
          <ArrowLeft className="mr-2 size-4" />
          Previous
        </Button>
        <Button
          disabled={session.mode === "learn" && !checked && !selected.length}
          onClick={primaryAction}
        >
          {session.mode === "learn"
            ? !checked
              ? "Check answer"
              : lastQuestion
                ? "Finish"
                : "Next"
            : lastQuestion
              ? "Submit test"
              : "Next"}
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </nav>
    </main>
  );
}
