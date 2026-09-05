import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "quiz-spa-database-v2";
function uid() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}
function shuffle(items) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }

  return result;
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    const nextCharacter = text[index + 1];
    const characterCode = character.charCodeAt(0);

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index++;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((characterCode === 10 || characterCode === 13) && !quoted) {
      if (characterCode === 13 && nextCharacter?.charCodeAt(0) === 10) {
        index++;
      }

      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);

  return rows;
}

function parseCsv(text, filename) {
  const rows = parseDelimitedRows(text, ";");

  if (rows.length < 2) throw new Error("CSV has no question rows");

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const questionColumn = headers.indexOf("question");
  const answersColumn = headers.indexOf("answers");
  const correctAnswersColumn = headers.indexOf("correct answers");
  if (questionColumn < 0 || answersColumn < 0 || correctAnswersColumn < 0) {
    throw new Error('Required columns: "question", "answers", "correct answers"');
  }
  const questions = rows
    .slice(1)
    .filter((cells) => cells.some(Boolean))
    .map((cells, rowIndex) => {
      const questionText = cells[questionColumn]?.trim();
      const rawAnswers = cells[answersColumn]?.trim();
      const rawCorrectAnswers = cells[correctAnswersColumn]?.trim();

      if (!questionText || !rawAnswers || !rawCorrectAnswers) {
        throw new Error(`Missing data on CSV row ${rowIndex + 2}`);
      }

      const parsedOptions = rawAnswers
        .split("|")
        .map((answer) => answer.trim())
        .filter(Boolean)
        .map((answer) => {
          const match = answer.match(/^([A-Z])\.\s*(.+)$/i);

          if (!match) {
            throw new Error(`Invalid answer format on CSV row ${rowIndex + 2}`);
          }

          return { key: match[1].toUpperCase(), text: match[2].trim() };
        });

      const correctKeys = rawCorrectAnswers
        .split(",")
        .map((answer) => answer.trim().toUpperCase())
        .filter(Boolean);

      const correctAnswers = correctKeys.map((key) => {
        const answerIndex = parsedOptions.findIndex((option) => option.key === key);

        if (answerIndex < 0) {
          throw new Error(`Correct answer "${key}" not found on CSV row ${rowIndex + 2}`);
        }

        return answerIndex;
      });

      return {
        id: uid(),
        question: questionText,
        options: parsedOptions.map((option) => option.text),
        correctAnswers: [...new Set(correctAnswers)].sort((left, right) => left - right),
        multiple: correctAnswers.length > 1,
        explanation: "",
      };
    });

  if (!questions.length) throw new Error("CSV contains no valid questions");

  return {
    id: uid(),
    title: filename.replace(/\.csv$/i, ""),
    description: `Imported from ${filename}`,
    sourceFile: filename,
    createdAt: new Date().toISOString(),
    questions,
  };
}

function normalizeQuiz(data, fallbackTitle) {
  const quiz = Array.isArray(data) ? { title: fallbackTitle, questions: data } : data;

  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length) {
    throw new Error("Question bank has no questions");
  }

  return {
    id: quiz.id || uid(),
    title: quiz.title || fallbackTitle,
    description: quiz.description || "JSON question bank",
    sourceFile: quiz.sourceFile || "",
    createdAt: quiz.createdAt || new Date().toISOString(),
    questions: quiz.questions.map((question, index) => {
      if (!question.question || !Array.isArray(question.options) || question.options.length < 2) {
        throw new Error(`Invalid question ${index + 1}`);
      }

      let correctAnswers;

      if (Array.isArray(question.correctAnswers)) {
        correctAnswers = question.correctAnswers.map(Number);
      } else if (Array.isArray(question.answer)) {
        correctAnswers = question.answer.map(Number);
      } else {
        correctAnswers = [Number(question.answer)];
      }

      correctAnswers = [
        ...new Set(
          correctAnswers.filter(
            (answer) =>
              Number.isInteger(answer) && answer >= 0 && answer < question.options.length,
          ),
        ),
      ].sort((left, right) => left - right);

      if (!correctAnswers.length) {
        throw new Error(`Invalid answer for question ${index + 1}`);
      }

      return {
        id: question.id || uid(),
        question: String(question.question),
        options: question.options.map(String),
        correctAnswers,
        multiple: correctAnswers.length > 1,
        explanation: question.explanation || "",
      };
    }),
  };
}

function answersMatch(selectedAnswers, correctAnswers) {
  if (!Array.isArray(selectedAnswers)) return false;

  const selected = [...selectedAnswers].sort((left, right) => left - right);
  const correct = [...correctAnswers].sort((left, right) => left - right);

  return (
    selected.length === correct.length &&
    selected.every((answer, index) => answer === correct[index])
  );
}

function createDatabaseExport(quizzes) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    quizzes,
  };
}

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function navigate(path) {
  window.location.hash = path;
}

function useRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || "/");

  useEffect(() => {
    const update = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return route;
}

function Button({ children, className = "", ...props }) {
  return (
    <button className={`btn ${className}`} {...props}>
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export default function QuizSPA() {
  const route = useRoute();
  const [quizzes, setQuizzes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
  }, [quizzes]);
  const routeParts = route.split("/").filter(Boolean);
  const selectedQuiz = quizzes.find((quiz) => quiz.id === routeParts[1]);
  function addQuizzes(items) {
    setQuizzes((current) => {
      const quizMap = new Map(current.map((quiz) => [quiz.id, quiz]));
      items.forEach((quiz) => quizMap.set(quiz.id, quiz));
      return [...quizMap.values()];
    });
  }

  async function importFiles(event) {
    const files = Array.from(event.target.files || []);

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
            imported.push(normalizeQuiz(data, file.name.replace(/\.json$/i, "")));
          }
        } else {
          throw new Error(`Unsupported file: ${file.name}`);
        }
      }

      addQuizzes(imported);
      setError("");

      if (files.some((file) => file.name.toLowerCase().endsWith(".csv"))) {
        downloadJsonFile(createDatabaseExport(imported), `quiz-import-${Date.now()}.json`);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      event.target.value = "";
    }
  }

  async function scanDirectory() {
    try {
      if (!("showDirectoryPicker" in window)) {
        throw new Error("Directory discovery requires Chrome or Edge");
      }

      const root = await window.showDirectoryPicker();
      const found = [];

      async function walk(handle) {
        for await (const entry of handle.values()) {
          if (entry.kind === "directory") {
            await walk(entry);
          } else if (entry.name.toLowerCase().endsWith(".json")) {
            try {
              const file = await entry.getFile();
              const data = JSON.parse(await file.text());

              if (Array.isArray(data.quizzes)) {
                found.push(
                  ...data.quizzes.map((quiz) => normalizeQuiz(quiz, entry.name)),
                );
              } else {
                found.push(normalizeQuiz(data, entry.name.replace(/\.json$/i, "")));
              }
            } catch (scanError) {
              console.warn(`Skipped ${entry.name}: ${scanError.message}`);
            }
          }
        }
      }

      await walk(root);
      if (!found.length) throw new Error("No valid JSON question banks found");
      addQuizzes(found);
      setError("");
    } catch (scanError) {
      if (scanError.name !== "AbortError") setError(scanError.message);
    }
  }

  function exportDatabase() {
    if (!quizzes.length) {
      setError("There are no quizzes to export");
      return;
    }

    downloadJsonFile(createDatabaseExport(quizzes), "quiz-database.json");
  }

  function start(quiz, mode, count = quiz.questions.length, minutes = 5) {
    setSession({
      quizId: quiz.id,
      mode,
      questions: shuffle(quiz.questions).slice(0, count),
      current: 0,
      answers: {},
      checked: {},
      endAt: mode === "test" ? Date.now() + minutes * 60000 : null,
      finished: false,
    });
    navigate(`/play/${quiz.id}`);
  }

  let content;

  if (routeParts[0] === "quiz" && selectedQuiz) {
    content = <QuizDetail quiz={selectedQuiz} start={start} />;
  } else if (routeParts[0] === "play" && session) {
    content = (
      <Player
        session={session}
        setSession={setSession}
        quiz={quizzes.find((quiz) => quiz.id === session.quizId)}
      />
    );
  } else {
    content = (
      <Library
        quizzes={quizzes}
        setQuizzes={setQuizzes}
        importFiles={importFiles}
        scanDirectory={scanDirectory}
        exportDatabase={exportDatabase}
        error={error}
      />
    );
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        button, input { font: inherit; }
        .shell { max-width: 1050px; margin: auto; padding: 32px 18px; }
        .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 28px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
        .card { background: white; border: 1px solid #e2e8f0; border-radius: 18px; padding: 22px; box-shadow: 0 5px 18px #0f172a0c; margin-bottom: 16px; }
        .btn { border: 0; border-radius: 12px; padding: 11px 16px; background: #4f46e5; color: white; font-weight: 700; cursor: pointer; }
        .btn:hover { filter: brightness(.95); }
        .btn:disabled { opacity: .45; cursor: not-allowed; }
        .secondary { background: white; color: #0f172a; border: 1px solid #cbd5e1; }
        .danger { background: #dc2626; }
        .answer { width: 100%; display: flex; gap: 12px; align-items: center; text-align: left; background: white; color: #0f172a; border: 1px solid #cbd5e1; margin: 10px 0; padding: 15px; border-radius: 14px; cursor: pointer; }
        .answer.selected { border: 2px solid #4f46e5; background: #eef2ff; }
        .answer.correct { border: 2px solid #16a34a; background: #f0fdf4; }
        .answer.wrong { border: 2px solid #dc2626; background: #fef2f2; }
        .num { display: grid; place-items: center; min-width: 30px; height: 30px; border-radius: 8px; background: #e2e8f0; font-weight: 800; }
        .muted { color: #64748b; }
        .error { padding: 12px; border-radius: 12px; background: #fef2f2; color: #b91c1c; margin-bottom: 16px; }
        .success { padding: 12px; border-radius: 12px; background: #f0fdf4; color: #166534; margin-top: 16px; }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .field { width: 100%; padding: 11px; border: 1px solid #cbd5e1; border-radius: 10px; margin-top: 6px; }
        .progress { height: 8px; background: #e2e8f0; border-radius: 9px; overflow: hidden; margin: 18px 0; }
        .bar { height: 100%; background: #4f46e5; }
        .result { font-size: 44px; font-weight: 900; }
        .hidden { display: none; }
        .badge { display: inline-block; padding: 4px 9px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 12px; font-weight: 700; }
        h1 { font-size: clamp(30px, 5vw, 48px); margin: 0 0 8px; }
        h2 { margin-top: 0; }
        @media (max-width: 600px) { .top { align-items: flex-start; flex-direction: column; } .shell { padding-top: 20px; } }
      `}</style>
      {content}
    </>
  );
}

function Library({
  quizzes,
  setQuizzes,
  importFiles,
  scanDirectory,
  exportDatabase,
  error,
}) {
  return (
    <main className="shell">
      <div className="top">
        <div>
          <h1>Quiz Studio</h1>
          <p className="muted">Local JSON question-bank database.</p>
        </div>
        <div className="actions">
          <Button onClick={scanDirectory}>Discover JSON folder</Button>
          <label className="btn secondary">
            Import CSV/JSON
            <input
              className="hidden"
              type="file"
              multiple
              accept=".json,.csv"
              onChange={importFiles}
            />
          </label>
          <Button className="secondary" onClick={exportDatabase} disabled={!quizzes.length}>
            Export database
          </Button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {!quizzes.length && (
        <Card>
          <h2>No quizzes</h2>
          <p className="muted">Import QB1_converted.csv or load a generated JSON database.</p>
        </Card>
      )}

      <div className="grid">
        {quizzes.map((quiz) => (
          <Card key={quiz.id}>
            <span className="badge">{quiz.questions.length} questions</span>
            <h2 style={{ marginTop: 14 }}>{quiz.title}</h2>
            <p className="muted">{quiz.description}</p>
            <div className="actions">
              <Button onClick={() => navigate(`/quiz/${quiz.id}`)}>Open</Button>
              <Button
                className="danger"
                onClick={() =>
                  setQuizzes((current) => current.filter((item) => item.id !== quiz.id))
                }
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}

function QuizDetail({ quiz, start }) {
  const [count, setCount] = useState(Math.min(quiz.questions.length, 10));
  const [minutes, setMinutes] = useState(10);

  return (
    <main className="shell">
      <Button className="secondary" onClick={() => navigate("/")}>
        ← All quizzes
      </Button>
      <h1 style={{ marginTop: 24 }}>{quiz.title}</h1>
      <p className="muted">
        {quiz.description} · {quiz.questions.length} questions
      </p>

      <div className="grid" style={{ marginTop: 24 }}>
        <Card>
          <h2>Learn mode</h2>
          <p className="muted">
            All questions, randomized order, no timer, and per-question checking.
          </p>
          <Button onClick={() => start(quiz, "learn")}>Start learning</Button>
        </Card>

        <Card>
          <h2>Test mode</h2>
          <label>
            Questions
            <input
              className="field"
              type="number"
              min="1"
              max={quiz.questions.length}
              value={count}
              onChange={(event) =>
                setCount(
                  Math.max(1, Math.min(quiz.questions.length, Number(event.target.value))),
                )
              }
            />
          </label>
          <br />
          <br />
          <label>
            Minutes
            <input
              className="field"
              type="number"
              min="1"
              value={minutes}
              onChange={(event) => setMinutes(Math.max(1, Number(event.target.value)))}
            />
          </label>
          <br />
          <br />
          <Button onClick={() => start(quiz, "test", count, minutes)}>Start test</Button>
        </Card>
      </div>
    </main>
  );
}

function Player({ session, setSession, quiz }) {
  const [now, setNow] = useState(Date.now());
  const question = session.questions[session.current];
  const selected = session.answers[session.current] || [];
  const checked = Boolean(session.checked[session.current]);
  const isCorrect = answersMatch(selected, question.correctAnswers);
  const secondsLeft = session.endAt
    ? Math.max(0, Math.ceil((session.endAt - now) / 1000))
    : null;
  const score = useMemo(
    () =>
      session.questions.reduce(
        (total, item, index) =>
          total + (answersMatch(session.answers[index], item.correctAnswers) ? 1 : 0),
        0,
      ),
    [session.answers, session.questions],
  );

  useEffect(() => {
    if (!session.endAt || session.finished) return undefined;
    const timerId = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timerId);
  }, [session.endAt, session.finished]);

  useEffect(() => {
    if (secondsLeft === 0 && !session.finished) {
      setSession((current) => ({ ...current, finished: true }));
    }
  }, [secondsLeft, session.finished, setSession]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (session.finished) return;

      const optionNumber = Number(event.key);
      if (optionNumber >= 1 && optionNumber <= question.options.length) {
        event.preventDefault();
        choose(optionNumber - 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      } else if (event.key === "Enter" && session.mode === "learn") {
        event.preventDefault();
        checkCurrentAnswer();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function choose(index) {
    if (session.mode === "learn" && checked) return;

    setSession((current) => {
      const currentQuestion = current.questions[current.current];
      const previous = current.answers[current.current] || [];
      const nextSelection = currentQuestion.multiple
        ? previous.includes(index)
          ? previous.filter((answer) => answer !== index)
          : [...previous, index].sort((left, right) => left - right)
        : [index];

      return {
        ...current,
        answers: { ...current.answers, [current.current]: nextSelection },
      };
    });
  }

  function checkCurrentAnswer() {
    if (!selected.length) return;
    setSession((current) => ({
      ...current,
      checked: { ...current.checked, [current.current]: true },
    }));
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

  if (!quiz) {
    return (
      <main className="shell">
        <div className="error">Question bank not found.</div>
        <Button onClick={() => navigate("/")}>All quizzes</Button>
      </main>
    );
  }

  if (session.finished) {
    return (
      <main className="shell">
        <Card>
          <div className="result">
            {score}/{session.questions.length}
          </div>
          <h2>Test complete</h2>
          <div className="actions">
            <Button onClick={() => navigate(`/quiz/${quiz.id}`)}>Try again</Button>
            <Button className="secondary" onClick={() => navigate("/")}>
              All quizzes
            </Button>
          </div>
        </Card>

        {session.questions.map((item, index) => {
          const selectedAnswers = session.answers[index] || [];
          const correct = answersMatch(selectedAnswers, item.correctAnswers);

          return (
            <Card key={item.id}>
              <h3>
                {index + 1}. {item.question}
              </h3>
              <p className={correct ? "success" : "error"}>
                Your answer:{" "}
                {selectedAnswers.length
                  ? selectedAnswers.map((answer) => item.options[answer]).join(", ")
                  : "Unanswered"}
              </p>
              <p>
                <b>Correct:</b>{" "}
                {item.correctAnswers.map((answer) => item.options[answer]).join(", ")}
              </p>
              {item.explanation && <p className="muted">{item.explanation}</p>}
            </Card>
          );
        })}
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="top">
        <Button className="secondary" onClick={() => navigate(`/quiz/${quiz.id}`)}>
          ← Exit
        </Button>
        <b>
          {session.current + 1}/{session.questions.length}
          {secondsLeft !== null &&
            ` · ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`}
        </b>
      </div>

      <div className="progress">
        <div
          className="bar"
          style={{ width: `${((session.current + 1) / session.questions.length) * 100}%` }}
        />
      </div>

      <Card>
        <p className="muted">
          Question {session.current + 1}
          {question.multiple ? " · Select all that apply" : " · Select one answer"}
        </p>
        <h2>{question.question}</h2>

        {question.options.map((option, index) => {
          const isSelected = selected.includes(index);
          const isCorrectOption = checked && question.correctAnswers.includes(index);
          const isWrongOption = checked && isSelected && !question.correctAnswers.includes(index);
          const stateClass = isCorrectOption
            ? "correct"
            : isWrongOption
              ? "wrong"
              : isSelected
                ? "selected"
                : "";

          return (
            <button
              key={option}
              className={`answer ${stateClass}`}
              onClick={() => choose(index)}
              disabled={checked}
            >
              <span className="num">{index + 1}</span>
              {option}
            </button>
          );
        })}

        {session.mode === "learn" && !checked && (
          <Button disabled={!selected.length} onClick={checkCurrentAnswer}>
            Check answer
          </Button>
        )}

        {checked && (
          <div className={isCorrect ? "success" : "error"}>
            <b>{isCorrect ? "Correct" : "Incorrect"}.</b>
            {!isCorrect && (
              <span>
                {" "}Correct answer: {question.correctAnswers
                  .map((answer) => question.options[answer])
                  .join(", ")}
              </span>
            )}
            {question.explanation && <div>{question.explanation}</div>}
          </div>
        )}
      </Card>

      <div className="top" style={{ marginTop: 18 }}>
        <Button className="secondary" disabled={!session.current} onClick={() => move(-1)}>
          ← Previous
        </Button>
        {session.current === session.questions.length - 1 ? (
          <Button
            onClick={() =>
              session.mode === "test"
                ? setSession((current) => ({ ...current, finished: true }))
                : navigate("/")
            }
          >
            {session.mode === "test" ? "Submit" : "Finish"}
          </Button>
        ) : (
          <Button onClick={() => move(1)}>Next →</Button>
        )}
      </div>
    </main>
  );
}