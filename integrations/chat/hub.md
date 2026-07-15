# Chat

First-party HTTP channel for terminal chat, web applications and hosted evaluations.

The public endpoint is scoped by the installation webhook ID. End users authenticate
with a low-privilege `x-user-key`; platform API keys are never exposed to clients.
