import { useState, type FormEvent } from "react";
import { Button, Field, Icon } from "./ui";
import { api } from "./api/client";
export default function PasswordReset({ onComplete, onCancel }: {
    onComplete: () => void;
    onCancel: () => void;
}) {
    const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
    const [error, setError] = useState(""), [saving, setSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
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
    return <main className="login-page password-reset-page"><div className="login-card"><section className="login-panel">
 <h1>Choose your password</h1><p>Replace the temporary password issued by your administrator.</p>
 <form className="login-form" onSubmit={submit}>
 <Field label="New password"><div className="password-field"><input aria-label="New password" type={showPassword ? "text" : "password"} minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required/><Button type="button" variant="text-button password-toggle" aria-label={`${showPassword ? "Hide" : "Show"} new password`} aria-pressed={showPassword} onClick={() => setShowPassword(visible => !visible)}><Icon name={showPassword ? "eye-off" : "eye"}/></Button></div></Field>
 <Field label="Confirm password"><div className="password-field"><input aria-label="Confirm password" type={showConfirmation ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required/><Button type="button" variant="text-button password-toggle" aria-label={`${showConfirmation ? "Hide" : "Show"} confirm password`} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(visible => !visible)}><Icon name={showConfirmation ? "eye-off" : "eye"}/></Button></div></Field>
 {confirmation && <p className={password === confirmation ? "password-match" : "error"} role="status">{password === confirmation ? "Passwords match." : "Passwords do not match."}</p>}
 <p>Use at least 8 characters.</p>
 {error && <p className="error" role="alert">{error}</p>}
 <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save password"}</Button>
 <Button onClick={onCancel}>Sign out</Button>
 </form></section></div></main>;
}
