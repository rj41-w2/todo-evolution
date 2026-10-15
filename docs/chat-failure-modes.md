# Chat failure modes

What a chat turn does when something goes wrong, and — more importantly — when
it is safe to ask again.

This exists because the rule used to be undefined, and the default behaviour
was the dangerous one: **a turn that had already changed your data answered
`500`, which is the response that tells you to try again.** Asking again then
created a second task.

## The shape of a turn

```
phase 1   short session   conversation, history, your message — committed
phase 2   no session      Gemini, then the MCP subprocess for each tool
phase 3   short session   the reply, if there is one
```

MCP tools run in a **separate process with their own transaction**. Whatever
they commit is already committed when phase 2 ends. There is no rollback to
fall back on, so the only honest option is to record what happened and say so.

That is what `outcome` on `ChatResponse` is for.

| `outcome` | Meaning |
|---|---|
| `completed` | Gemini summarised the turn and every tool succeeded |
| `partial` | some of it happened, or Gemini could not summarise it |
| `failed` | nothing happened |

## Failure matrix

| What fails | HTTP | `outcome` | Your data | Safe to retry? |
|---|---|---|---|---|
| Gemini, before any tool | 200 | `failed` | untouched | **Yes** |
| Gemini, after tools ran | 200 | `partial` | **changed** | **No** — check `tool_calls` first |
| One tool fails | 200 | `partial` | the other tools' changes | **No** — same |
| Every tool fails | 200 | `partial` / `failed` | untouched | Yes |
| A tool asks for something absent | 200 | `partial` | untouched | No — fix the request first |
| Postgres unavailable | 200 | `failed` | untouched | Yes |

Every one of these is `200`. That is deliberate. A 5xx tells the caller the
turn did not happen, which is not true whenever a tool committed, and the
natural response to a 5xx is to repeat the request.

The two fields to read are `outcome` and `tool_calls`. Each tool call carries
`ok: true` or `ok: false`.

```jsonc
{
  "conversation_id": "…",
  "response": "Completed 1 action(s). 1 action(s) could not be completed.",
  "outcome": "partial",
  "tool_calls": [
    {"tool": "add_task",     "parameters": {"title": "Buy milk"}, "result": {...}, "ok": true},
    {"tool": "delete_task",  "parameters": {"task_id": "…"},        "result": null,  "ok": false}
  ]
}
```

## Retrying

`add_task` is **not** idempotent. Re-sending a turn that created a task will
create another one. There is no idempotency key: issue #4 deliberately left
that out in favour of a truthful response, on the reasoning that a caller who
can see what happened does not need one.

So the rule for a client is:

1. If `outcome` is `failed`, retry freely — nothing happened.
2. If `outcome` is `partial`, read `tool_calls` and retry **only** what came
   back `ok: false`.
3. If you cannot inspect `tool_calls`, do not blind-retry a `partial` turn.

Moving to real idempotency keys is the natural follow-up if clients turn out
to need the protection rather than the information.

## What the reply says when Gemini does not

Phase 3 writes the reply from the tool results, not from Gemini, because Gemini
is the thing that is missing:

```
Completed 2 action(s). 1 action(s) could not be completed.
```

When Gemini failed before speaking **and** no tool ran, no assistant message is
written at all. An empty one would be noise in the history Gemini is later
replayed, and a message row claiming something happened when nothing did. Your
message still survives either way.

## Two things deliberately not done here

**Tool error text is not surfaced.** The MCP server wraps any exception as
`Error executing tool <name>: <reason>`. For a missing task that reason is a
friendly sentence; for a database failure it is
`(psycopg2.OperationalError) connection to server at "db.internal" (10.0.0.4),
port 5432 failed`. It is logged in full and shown to you as nothing more than
`ok: false`. Surfacing friendly domain errors without also surfacing driver
text needs a structured error contract, which is issue #3's acceptance
criterion rather than this one's.

**No conversation-coordination lock on the tool phase.** `pg_advisory_xact_lock`
serialises conversation *creation* per user. It is released when phase 1
commits, before any tool runs. Two concurrent turns from one user can
therefore interleave their tool calls; they cannot interleave their creation of
a conversation, so the original race — two conversations appearing from one
message — is closed. Sequencing the whole turn would mean holding a connection
across the LLM calls, which is the defect from issue #12.