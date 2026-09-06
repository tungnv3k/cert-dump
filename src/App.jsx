import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "quiz-spa-database-v3";
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseRows(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;


  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];


    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char.charCodeAt(0) === 10 || char.charCodeAt(0) === 13) && !quoted) {
      if (char.charCodeAt(0) === 13 && next?.charCodeAt(0) === 10) i += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }


  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeQuestion(question, index) {
  if (!question?.question || !Array.isArray(question.options) || question.options.length < 2) {
    throw new Error(`Invalid question ${index + 1}`);
  }


  let correct = Array.isArray(question.correctAnswers)
    ? question.correctAnswers
    : Array.isArray(question.answer)
      ? question.answer
      : [question.answer];


  correct = [...new Set(correct.map(Number).filter(answer =>
    Number.isInteger(answer) && answer >= 0 && answer < question.options.length
  ))].sort((a, b) => a - b);


  if (!correct.length) throw new Error(`Invalid answer for question ${index + 1}`);


  return {
    id: question.id || uid(),
    question: String(question.question),
    options: question.options.map(String),
    correctAnswers: correct,
    multiple: correct.length > 1,
    explanation: question.explanation || ""
  };
}


function normalizeQuiz(data, fallbackTitle) {
  const source = Array.isArray(data) ? { title: fallbackTitle, questions: data } : data;
  if (!source || !Array.isArray(source.questions) || !source.questions.length) {
    throw new Error("Question bank has no questions");
  }


  return {
    id: source.id || uid(),
    title: source.title || fallbackTitle,
    description: source.description || "JSON question bank",
    questions: source.questions.map(normalizeQuestion)
  };
}


function parseCsv(text, filename) {
  const rows = parseRows(text);
  if (rows.length < 2) throw new Error("CSV has no question rows");


  const headers = rows[0].map(header => header.trim().toLowerCase());
  const questionColumn = headers.indexOf("question");
  const answersColumn = headers.indexOf("answers");
  const correctColumn = headers.indexOf("correct answers");


  if (questionColumn < 0 || answersColumn < 0 || correctColumn < 0) {
    throw new Error('Required columns: "question", "answers", "correct answers"');
  }


  const questions = rows.slice(1).filter(row => row.some(Boolean)).map((cells, rowIndex) => {
    const questionText = cells[questionColumn]?.trim();
    const rawAnswers = cells[answersColumn]?.trim();
    const rawCorrect = cells[correctColumn]?.trim();


    if (!questionText || !rawAnswers || !rawCorrect) {
      throw new Error(`Missing data on CSV row ${rowIndex + 2}`);
    }


    const options = rawAnswers.split("|").map(item => item.trim()).filter(Boolean).map(item => {
      const match = item.match(/^([A-Z])[.]\s*(.+)$/i);
      if (!match) throw new Error(`Invalid answer format on CSV row ${rowIndex + 2}`);
      return { key: match[1].toUpperCase(), text: match[2].trim() };
    });


    const correctAnswers = [...new Set(rawCorrect.split(",").map(key => key.trim().toUpperCase()).filter(Boolean).map(key => {
      const answerIndex = options.findIndex(option => option.key === key);
      if (answerIndex < 0) throw new Error(`Correct answer ${key} not found on CSV row ${rowIndex + 2}`);
      return answerIndex;
    }))].sort((a, b) => a - b);


    return {
      id: uid(),
      question: questionText,
      options: options.map(option => option.text),
      correctAnswers,
      multiple: correctAnswers.length > 1,
      explanation: ""
    };
  });

  return {
    id: uid(),
    title: filename.replace(/[.]csv$/i, ""),
    description: `Imported from ${filename}`,
    questions
  };
}

function answersMatch(selected = [], correct = []) {
  const left = [...selected].sort((a, b) => a - b);
  const right = [...correct].sort((a, b) => a - b);
  return left.length === right.length && left.every((answer, index) => answer === right[index]);
}

function Button({ children, className = "", ...props }) {
  return <button className={`button ${className}`} {...props}>{children}</button>;
}

export default function QuizPlatform() {
  const [quizzes, setQuizzes] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [screen, setScreen] = useState("library");
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
  }, [quizzes]);

  async function importFiles(event) {
    try {
      const imported = [];
      for (const file of Array.from(event.target.files || [])) {
        const text = await file.text();
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith(".csv")) {
          imported.push(parseCsv(text, file.name));
        } else if (lowerName.endsWith(".json")) {
          const data = JSON.parse(text);
          if (Array.isArray(data.quizzes)) {
            imported.push(...data.quizzes.map(item => normalizeQuiz(item, file.name)));
          } else {
            imported.push(normalizeQuiz(data, file.name.replace(/[.]json$/i, "")));
          }
        }
      }
      setQuizzes(current => [...current, ...imported]);
      setError("");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      event.target.value = "";
    }
  }

  function openQuiz(quiz) {
    setActiveQuiz(quiz);
    setScreen("detail");
  }

  function start(mode) {
    setSession({
      mode,
      questions: shuffle(activeQuiz.questions),
      current: 0,
      answers: {},
      checked: {},
      finished: false
    });
    setScreen("play");
  }

  function leavePlayer() {
    setSession(null);
    setScreen(activeQuiz ? "detail" : "library");
  }

  return (
    <div className="app">
      {screen === "library" && (
        <main className="shell">
          <div className="top">
            <div><h1>Quiz Studio</h1><p className="muted">Import a CSV or JSON question bank.</p></div>
            <label className="button">Import CSV/JSON<input className="hidden" type="file" multiple accept=".csv,.json" onChange={importFiles} /></label>
          </div>
          {error && <div className="error">{error}</div>}
          {!quizzes.length && <section className="card"><h2>No quizzes yet</h2><p className="muted">Import a question bank to begin.</p></section>}
          <div className="grid">
            {quizzes.map(quiz => (
              <section className="card" key={quiz.id}>
                <span className="badge">{quiz.questions.length} questions</span>
                <h2 style={{ marginTop: 14 }}>{quiz.title}</h2>
                <p className="muted">{quiz.description}</p>
                <div className="top">
                  <Button onClick={() => openQuiz(quiz)}>Open</Button>
                  <Button className="danger" onClick={() => setQuizzes(current => current.filter(item => item.id !== quiz.id))}>Delete</Button>
                </div>
              </section>
            ))}
          </div>
        </main>
      )}

      {screen === "detail" && activeQuiz && (
        <main className="shell">
          <Button className="secondary" onClick={() => setScreen("library")}>← All quizzes</Button>
          <section className="card">
            <span className="badge">{activeQuiz.questions.length} questions</span>
            <h1 style={{ marginTop: 14 }}>{activeQuiz.title}</h1>
            <p className="muted">Single answers use radio buttons. Multiple answers use checkboxes.</p>
            <div className="top">
              <Button onClick={() => start("learn")}>Start learning</Button>
              <Button className="secondary" onClick={() => start("test")}>Start test</Button>
            </div>
          </section>
        </main>
      )}

      {screen === "play" && session && activeQuiz && (
        <Player session={session} setSession={setSession} quiz={activeQuiz} onExit={leavePlayer} />
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
  const score = useMemo(() => session.questions.reduce((total, item, index) =>
    total + (answersMatch(session.answers[index], item.correctAnswers) ? 1 : 0), 0
  ), [session.answers, session.questions]);

  function choose(index) {
    if (session.mode === "learn" && checked) return;
    setSession(current => {
      const active = current.questions[current.current];
      const previous = current.answers[current.current] || [];
      const nextSelection = active.multiple
        ? previous.includes(index)
          ? previous.filter(answer => answer !== index)
          : [...previous, index].sort((a, b) => a - b)
        : [index];
      return { ...current, answers: { ...current.answers, [current.current]: nextSelection } };
    });
  }

  function move(delta) {
    setSession(current => ({
      ...current,
      current: Math.max(0, Math.min(current.questions.length - 1, current.current + delta))
    }));
  }

  function primaryAction() {
    if (session.mode === "learn" && !checked) {
      if (!selected.length) return;
      setSession(current => ({
        ...current,
        checked: { ...current.checked, [current.current]: true }
      }));
      return;
    }

    if (lastQuestion) {
      if (session.mode === "test") setSession(current => ({ ...current, finished: true }));
      else onExit();
    } else {
      move(1);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (session.finished) return;
      const number = Number(event.key);
      if (number >= 1 && number <= question.options.length) {
        event.preventDefault();
        choose(number - 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      } else if (event.key === "ArrowRight" || (event.key === "Enter" && session.mode === "learn")) {
        event.preventDefault();
        primaryAction();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  if (session.finished) {
    return (
      <main className="shell">
        <section className="card">
          <div className="result">{score}/{session.questions.length}</div>
          <h2>Test complete</h2>
          <Button onClick={onExit}>Back to quiz</Button>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="top">
        <Button className="secondary" onClick={onExit}>← Exit</Button>
        <b>{session.current + 1}/{session.questions.length}</b>
      </div>
      <div className="progress"><div className="bar" style={{ width: `${((session.current + 1) / session.questions.length) * 100}%` }} /></div>
      <section className="card">
        <p className="muted">Question {session.current + 1} · {question.multiple ? "Select all that apply" : "Select one answer"}</p>
        <h2>{question.question}</h2>
        {question.options.map((option, index) => {
          const isSelected = selected.includes(index);
          const isCorrectOption = checked && question.correctAnswers.includes(index);
          const isWrongOption = checked && isSelected && !question.correctAnswers.includes(index);
          const state = isCorrectOption ? "correct" : isWrongOption ? "wrong" : isSelected ? "selected" : "";
          return (
            <label className={`answer ${state}`} key={`${question.id}-${index}`}>
              <input
                type={question.multiple ? "checkbox" : "radio"}
                name={`question-${question.id}`}
                checked={isSelected}
                disabled={session.mode === "learn" && checked}
                onChange={() => choose(index)}
              />
              <span>{option}</span>
            </label>
          );
        })}
        {checked && (
          <div className={correct ? "success" : "error"}>
            <b>{correct ? "Correct." : "Incorrect."}</b>
            {!correct && <span> Correct answer: {question.correctAnswers.map(index => question.options[index]).join(", ")}</span>}
            {question.explanation && <div>{question.explanation}</div>}
          </div>
        )}
      </section>
      <div className="top" style={{ marginTop: 18 }}>
        <Button className="secondary" disabled={session.current === 0} onClick={() => move(-1)}>← Previous</Button>
        <Button disabled={session.mode === "learn" && !checked && !selected.length} onClick={primaryAction}>
          {session.mode === "learn"
            ? !checked ? "Check answer →" : lastQuestion ? "Finish →" : "Next →"
            : lastQuestion ? "Submit" : "Next →"}
        </Button>
      </div>
    </main>
  );
}