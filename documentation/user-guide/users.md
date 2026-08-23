# Users

Who can sign in, and what they can do once they have.

Only an administrator sees this screen — **Users** is hidden from the sidebar
for anyone else, and the API refuses the underlying requests with 403 even for
someone who reaches the URL directly.

## Roles

| Role | Can |
|---|---|
| **Administrator** | Everything |
| **User** | Day-to-day work: clients, invoices, expenses, payments, reports |

A User cannot manage accounts, and cannot reach the administration surfaces
either: changing settings, project settings, the email and Stripe connection
tests, deactivating a payment link, or the scheduled-job routes. Those all
answer **403** for anyone who is not an administrator.

The API also recognises a `viewer` role, but nothing in the application
currently treats it differently from `user`, and this screen does not offer
it — offering a role that grants no distinct access would promise something
that isn't there.

## Adding a user

**Users → Add User.** Name, email, username, role and an initial password (8
to 128 characters).

## Editing a user

**Edit** on a row changes name, email, username or role. It cannot set a
password — that is what the reset button is for.

## Resetting a password

The key icon on a row opens a dialog for a new password, entered twice. The
person is not notified automatically; tell them yourself.

## Unlocking an account

Repeated failed sign-ins lock an account temporarily (see
[Getting started](README.md#signing-in)). The unlock icon appears only on a
locked row and clears the lockout immediately — it does not touch the
password.

## The last administrator

An install can never be left without one. On the only remaining administrator,
**Delete** is disabled and the **Role** field is disabled while editing them,
so the screen never offers a change it would refuse anyway.

The refusal is real, not just a disabled button: the server enforces it at the
database level and returns it to a direct API call too, as **409**. See
[ADR-0017](../adr/0017-last-admin-invariant.md) for why.

## Removing your own access

You can delete or demote yourself, as long as another administrator remains.
The screen warns first — *"You are about to remove your own administrator
access. You will be signed out and another administrator will have to restore
it."* — and signs you out the moment you confirm.

## Next

- [Settings](settings.md)
