import { useState, type FormEvent } from "react";
import { Button, Field } from "./ui";
import { api } from "./api/client";
export default function PasswordReset({ onComplete, onCancel }: {
    onComplete: () => void;
    onCancel: () => void;
}) {
    const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
    const [error, setError] = useState(""), [saving, setSaving] = useState(false);
    async function submit(event: FormEvent) {
        event.preventDefault();
        setError("");
        if (password.length < 8 || password !== confirmation) {
            setError("Use at least 8 characters and enter the same password twice.");
            return;
        }
        setSaving(true);
        try {
            await api("/auth/reset-password", { method: "POST", json: { password } });
            onComplete();
        }
        catch (reason) {
            setError((reason as Error).message);
        }
        finally {
            setSaving(false);
        }
    }
    return <main className="login-page"><div className="login-card"><section className="login-panel">
 <h1>Choose your password</h1><p>Replace the temporary password issued by your administrator.</p>
 <form className="login-form" onSubmit={submit}>
 <Field label="New password"><input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required/></Field>
 <Field label="Confirm password"><input type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required/></Field>
 {error && <p className="error" role="alert">{error}</p>}
 <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save password"}</Button>
 <Button onClick={onCancel}>Sign out</Button>
 </form></section></div></main>;
}
