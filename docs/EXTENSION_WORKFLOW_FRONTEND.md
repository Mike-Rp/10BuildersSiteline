# Extension workflow frontend status

The standalone demo entry, account switcher and demo navigation have been removed from the local application and Vercel build. The former `?extensionDemo=1` URL now opens the normal application and its existing sign-in flow. Vercel uses the standard `npm run build` command again.

The approved eight-field report, review dialogs, role checks, request transitions, history and frontend state components remain available for the next frontend work. They do not create backend endpoints or persist real deadline changes. No workflow provider or dummy project workspace is mounted in the application.

The former demo harness is retained only under `tests/fixtures/ExtensionWorkflowHarness.tsx` to preserve automated coverage of the approved behavior. It is not imported by `src/App.tsx` or included as an application route. The test also verifies that the real App ignores the former demo URL and requires the normal login.

The sample account and project reference is preserved in the conversation. Browser-local demo cache keys are inert and are never used by the normal application. Authentication, backend code, database records, real deadlines and construction phase evidence validation are unchanged.
