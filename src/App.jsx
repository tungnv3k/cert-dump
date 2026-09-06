
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  GraduationCap,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const STORAGE_KEY = "quiz-studio-v4";
const uid = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

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

  const correctAnswers = [...new Set(
    rawCorrect
      .map(Number)
      .filter(
        (answer) =>
          Number.isInteger(answer) &&
          answer >= 0 &&
          answer < question.options.length,
      ),
  )].sort((a, b) => a - b);

  if (!correctAnswers.length) {
    throw new Error(`Invalid answer for question ${index + 1}.`);
  }

  const options = question.options.map((option) => String(option).trim());
  if (options.some((option) => !option)) {
    throw new Error(`Question ${index + 1} contains an empty option.`);
  }

  return {
    id: question.id || uid(),
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
    id: source.id || uid(),
    title: String(source.title || fallbackTitle || "Untitled quiz").trim(),
    description: String(source.description || "Imported question bank").trim(),
    questions: source.questions.map(normalizeQuestion),
  };
}

function parseCsv(text, filename) {
  const rows = parseRows(text.replace(/^\uFEFF/, ""));
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
            throw new Error(`Invalid answer format on CSV row ${rowIndex + 2}.`);
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

      const correctAnswers = [...new Set(
        rawCorrect
          .split(",")
          .map((key) => key.trim().toUpperCase())
          .filter(Boolean)
          .map((key) => {
            const answerIndex = options.findIndex((option) => option.key === key);
            if (answerIndex < 0) {
              throw new Error(
                `Correct answer ${key} was not found on CSV row ${rowIndex + 2}.`,
              );
            }
            return answerIndex;
          }),
      )].sort((a, b) => a - b);

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
    id: uid(),
    title: filename.replace(/\.csv$/i, ""),
    description: `Imported from ${filename}`,
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

function loadQuizzes() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function QuizPlatform() {
  const [quizzes, setQuizzes] = useState(loadQuizzes);
  const [screen, setScreen] = useState("library");
  const [activeQuizId, setActiveQuizId] = useState(null);
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState(null);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef(null);

  const activeQuiz = useMemo(
    () => quizzes.find((quiz) => quiz.id === activeQuizId) || null,
    [quizzes, activeQuizId],
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
    } catch {
      setMessage({
        type: "error",
        title: "Save failed",
        text: "Browser storage is unavailable or full.",
      });
    }
  }, [quizzes]);

  async function importFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
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
              ...data.quizzes.map((quiz) => normalizeQuiz(quiz, file.name)),
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

      setQuizzes((current) => [...current, ...imported]);
      setMessage({
        type: "success",
        title: "Import complete",
        text: `${imported.length} quiz${imported.length === 1 ? "" : "zes"} added.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        title: "Import failed",
        text: error instanceof Error ? error.message : "Unable to import files.",
      });
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  function openQuiz(quiz) {
    setActiveQuizId(quiz.id);
    setScreen("detail");
  }

  function deleteQuiz(quizId) {
    setQuizzes((current) => current.filter((quiz) => quiz.id !== quizId));
    if (activeQuizId === quizId) {
      setActiveQuizId(null);
      setScreen("library");
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
    setScreen(activeQuiz ? "detail" : "library");
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <div className="sr-only" aria-live="polite">
        {message?.text}
      </div>

      {screen === "library" && (
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
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
                Import CSV or JSON question banks and practice at your pace.
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
            </Alert>
          )}

          {!quizzes.length ? (
            <Card className="mt-8 border-dashed">
              <CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                <GraduationCap className="size-10 text-muted-foreground" />
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold">No quizzes yet</h2>
                  <p className="text-sm text-muted-foreground">
                    Import a question bank to begin.
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
                            “{quiz.title}” and all its questions will be removed from
                            this browser.
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
          )}
        </main>
      )}

      {screen === "detail" && activeQuiz && (
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
          <Button variant="ghost" onClick={() => setScreen("library")}>
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
                Learning mode gives instant feedback. Test mode shows results after
                submission.
              </p>
            </CardContent>
            <CardFooter className="flex-col gap-3 sm:flex-row">
              <Button className="w-full sm:w-auto" onClick={() => start("learn")}>
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

  function choose(index) {
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
  }

  function move(delta) {
    setSession((current) => ({
      ...current,
      current: Math.max(
        0,
        Math.min(current.questions.length - 1, current.current + delta),
      ),
    }));
  }

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

  function ResultStat({ label, value }) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      </div>
    );
  }


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


            <section className="space-y-4" aria-labelledby="answer-review-title">
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
                              variant={itemCorrect ? "secondary" : "destructive"}
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
                          <span className="font-medium">Your answer:</span>{" "}
                          <span className="text-muted-foreground">
                            {userAnswerText}
                          </span>
                        </p>
                        {!itemCorrect && (
                          <p>
                            <span className="font-medium">Correct answer:</span>{" "}
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
    const isWrong = checked && isSelected && !question.correctAnswers.includes(index);

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
                    Correct answer: {question.correctAnswers
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
