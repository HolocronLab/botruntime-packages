/**
 * Inspector Handler
 *
 * Provides the debug endpoint for returning the bot process PID.
 *
 * - POST /__debug/inspector — Returns the process PID so VS Code can attach by PID.
 *   The inspector is NOT started here — VS Code starts it automatically when attaching.
 *
 * Debugging is one-way: press [d] in `adk dev` to enable, then disconnect from
 * VS Code when done (or let the process restart on file changes).
 */

export interface InspectorResponse {
  pid: number
}

/**
 * Handles the inspector debug request.
 * Returns the PID without starting the inspector — VS Code will start it
 * automatically when attaching to the process by PID.
 *
 * @returns HTTP response with PID information
 */
export async function handleInspectorRequest(): Promise<{
  statusCode: number
  headers: Record<string, string>
  body: string
}> {
  const responseData: InspectorResponse = {
    pid: process.pid,
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(responseData),
  }
}
