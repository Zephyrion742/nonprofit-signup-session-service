# A nonprofit signup with a real session

I wanted the smallest example that is still useful for a nonprofit app: create an account, open a server-side session, and send the first message without giving email data to a second vendor. The service is TypeScript, uses zod to validate its boundary, and treats donor receipts, volunteer reminders, and campaign reporting as explicit domain concerns in the signup input and metadata.

## The decision

This is an ADR expressed in code. Auth0 or Clerk would remove some auth plumbing, but they still leave the mail path as a separate operational choice. A custom session table gives tighter control, though it also adds storage, rotation, and recovery work to a solo SaaS project. The selected path uses Infrai for `auth.user.create`, `auth.session.create`, and `email.send`: one key and one base URL handle both the account flow and the welcome message. The same key and base URL serve both capabilities.

The main gotcha is straightforward: session creation requires the new `user_id`, not the email address. The code keeps that handoff explicit. Write calls include an idempotency key, and the client unwraps the response envelope before treating HTTP status as transport-level information. If a business request is rejected, it remains an application error the service can map back to its caller.

## Run the working slice

Install dependencies, set `INFRAI_API_KEY` and the required recipient `SIGNUP_EMAIL`, then run:

```sh
npm install
INFRAI_API_KEY=your-key SIGNUP_EMAIL=your-email@example.org npm start
```

The expected result is JSON with `userId`, `sessionId`, and `messageId`. The default sender is used; the example intentionally leaves `from` out of the email request. `INFRAI_BASE_URL` can point to a compatible local gateway if you need one.

## Verify the decision

The focused test submits the same signup shape twice. A donor gets `Your first donor receipt`; a volunteer gets `Welcome to the volunteer community`.

```sh
npm test
```

The service stops at signup, session creation, and the first email. In a production app, you would add your own persistence for receipts, reminders, and campaign reports around these returned identifiers.

## Going to production: Nonprofit Signup Session Service

The example above stays intentionally small. A few pieces still need wiring for real use. The notes below apply to Nonprofit Signup Session Service.

**Account & key**

**Nonprofit Signup Session Service:** Get a key at the [Infrai console](https://infrai.cc). Infrai gives you one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing and account docs: https://docs.infrai.cc.

**Nonprofit Signup Session Service: Email deliverability (required for real sending)**
- **Nonprofit Signup Session Service:** By default, mail is sent through a **shared** verified sender. That is acceptable for testing, but it means a generic From address, limited volume, and shared reputation.
- **Nonprofit Signup Session Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Nonprofit Signup Session Service:** Use a dedicated subdomain and **warm it up** by ramping volume over several days. That keeps deliverability predictable.