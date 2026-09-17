import { useRef, useState } from "react";
import useUndo from "use-undo";
import { CornerDownLeft, FileText, Redo2, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function TxtEditor({ onBack }) {
  const [
    textState,
    {
      set: setTextWithHistory,
      reset: resetHistory,
      undo,
      redo,
      canUndo,
      canRedo,
    },
  ] = useUndo("");
  const text = textState.present;
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("Upload a TXT file to begin");
  const fileInputRef = useRef(null);

  const textareaRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const handleFile = (file) => {
    if (!file) return;

    const isTxt =
      file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");

    if (!isTxt) {
      setMessage("Please select a valid .txt file");
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      const content = String(event.target?.result ?? "");
      resetHistory(content);
      setFileName(file.name);
      setMessage(`${file.name} loaded successfully`);
      selectionRef.current = { start: 0, end: 0 };
    };

    reader.onerror = () => setMessage("Unable to read the selected file");
    reader.readAsText(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0]);
  };

  const handleHistoryShortcut = (event) => {
    const modifierPressed = event.ctrlKey || event.metaKey;

    if (!modifierPressed || event.altKey) return;

    const key = event.key.toLowerCase();

    // Ctrl+Z or Cmd+Z
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();

      if (canUndo) {
        undo();
        setMessage("Undid last change");
      }

      return;
    }

    // Ctrl+Shift+Z or Cmd+Shift+Z
    if (key === "z" && event.shiftKey) {
      event.preventDefault();

      if (canRedo) {
        redo();
        setMessage("Redid change");
      }

      return;
    }

    // Optional Windows-style Ctrl+Y
    if (key === "y" && !event.shiftKey) {
      event.preventDefault();

      if (canRedo) {
        redo();
        setMessage("Redid change");
      }
    }
  };

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  };

  const insertContentAtCursor = (content, successMessage) => {
    const textarea = textareaRef.current;
    const { start, end } = selectionRef.current;
    const safeStart = Math.min(start, text.length);
    const safeEnd = Math.min(end, text.length);
    const nextText = text.slice(0, safeStart) + content + text.slice(safeEnd);
    const nextCursorPosition = safeStart + content.length;
    setTextWithHistory(nextText);
    setMessage(successMessage);
    selectionRef.current = {
      start: nextCursorPosition,
      end: nextCursorPosition,
    };
    requestAnimationFrame(() => {
      if (!textarea) return;

      const scrollTop = textarea.scrollTop;
      const scrollLeft = textarea.scrollLeft;

      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);

      textarea.scrollTop = scrollTop;
      textarea.scrollLeft = scrollLeft;
    });
  };

  const insertNewLineAtCursor = (count = 1) => {
    insertContentAtCursor("\n".repeat(count), "New line inserted at cursor");
  };

  return (
    <main
      className="min-h-screen bg-muted/40 p-4 sm:p-8"
      onKeyDownCapture={handleHistoryShortcut}
    >
      <Button
        type="button"
        className="mx-auto mb-4 block"
        onClick={() => onBack?.()}
      >
        Back to main screen
      </Button>

      <div className="fixed bottom-0 right-0 w-full flex flex-row-reverse items-center gap-2 p-2 bg-background/80 backdrop-blur-sm sm:gap-3 sm:p-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            undo();
            setMessage("Undid last change");
          }}
          disabled={!canUndo}
        >
          <Undo2 className="size-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            redo();
            setMessage("Redid change");
          }}
          disabled={!canRedo}
        >
          <Redo2 className="size-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => insertNewLineAtCursor()}
        >
          <CornerDownLeft className="size-4" />1
        </Button>

        <Button
          type="button"
          variant="outline"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => insertNewLineAtCursor(2)}
        >
          <CornerDownLeft className="size-4" />2
        </Button>

        <Button
          type="button"
          variant="outline"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => insertNewLineAtCursor(3)}
        >
          <CornerDownLeft className="size-4" />3
        </Button>
      </div>

      <Card className="mx-auto max-w-5xl overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="size-5" />
            </div>

            <div className="space-y-1">
              <CardTitle>TXT Editor</CardTitle>

              <CardDescription>
                Upload a plain-text file, edit its content, then clean, reset,
                or copy it.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 p-5 sm:p-6">
          <Input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="group flex w-full flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/60"
          >
            <span className="mb-3 grid size-11 place-items-center rounded-full border bg-background shadow-sm transition-transform group-hover:-translate-y-0.5">
              <Upload className="size-5 text-primary" />
            </span>

            <span className="text-sm font-medium">
              Drop a TXT file here or click to upload
            </span>

            <span className="mt-1 text-xs text-muted-foreground">
              {fileName || message}
            </span>
          </button>

          <div className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">File content</p>
                <p className="text-xs text-muted-foreground">{message}</p>
              </div>
            </div>

            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => {
                setTextWithHistory(event.target.value);
                setMessage("Editing");
                selectionRef.current = {
                  start: event.target.selectionStart,
                  end: event.target.selectionEnd,
                };
              }}
              onSelect={rememberSelection}
              onClick={rememberSelection}
              onKeyUp={rememberSelection}
              placeholder="Upload a TXT file or type text here..."
              spellCheck={false}
              className="min-h-130 resize-y bg-background font-mono text-sm leading-6"
            />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
