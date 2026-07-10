# Supported command subset

| Command | Contract |
| --- | --- |
| `brt dev` | Creates or reconciles the exact development target and starts the development loop. |
| `brt dev --check` | Read-only readiness check after target metadata already exists. |
| `tsc --noEmit` | Type-checks the project without generating output. |
| `brt deploy --adk` | Reconciles dependencies and deploys the ADK production target. |
| `brt profiles active` | Shows the selected CLI profile. |
| `brt integrations list` | Lists integrations visible to the selected profile. |
| `brt integrations get <id>` | Reads one integration by its CLI identifier. |
| `brt integrations install <name>` | Installs an integration on the selected linked target. This changes remote state. |
| `brt chat` | Experimental interactive chat that starts a new conversation. |

`brt logs` exists, but access depends on server support for the selected profile
and bot. Treat an authentication or route rejection as an unavailable surface;
do not work around it by exposing credentials.

The CLI currently has no structured trace, conversation, workflow-run, eval,
or project-status commands.
