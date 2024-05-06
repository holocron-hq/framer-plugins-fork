import "./globals.css"

import React, { ReactNode, Suspense } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ErrorBoundary } from "react-error-boundary"
import { CenteredSpinner } from "./components/CenteredSpinner"
import { PluginContext, PluginContextUpdate, getPluginContext, synchronizeDatabase } from "./notion"

import { framer } from "framer-plugin"
import { logSyncResult } from "./debug.ts"
import { ErrorBoundaryFallback } from "./components/ErrorBoundaryFallback"

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
})

function shouldSyncImmediately(pluginContext: PluginContext): pluginContext is PluginContextUpdate {
    if (pluginContext.type === "new") return false

    if (!pluginContext.database) return false
    if (pluginContext.hasChangedFields) return false

    return true
}

function renderPlugin(app: ReactNode) {
    const root = document.getElementById("root")
    if (!root) throw new Error("Root element not found")

    ReactDOM.createRoot(root).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>
                <div className="px-4 w-full flex flex-col overflow-auto flex-1">
                    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
                        <Suspense fallback={<CenteredSpinner />}>{app}</Suspense>
                    </ErrorBoundary>
                </div>
            </QueryClientProvider>
        </React.StrictMode>
    )
}

async function runPlugin() {
    try {
        const pluginContext = await getPluginContext()
        const mode = framer.mode

        if (mode === "syncCollection" && shouldSyncImmediately(pluginContext)) {
            const result = await synchronizeDatabase(pluginContext.database, {
                fields: pluginContext.collectionFields,
                ignoredFieldIds: pluginContext.ignoredFieldIds,
                lastSyncedTime: pluginContext.lastSyncedTime,
            })

            logSyncResult(result)

            await framer.closePlugin()
            return
        }

        framer.showUI({
            width: 350,
            height: pluginContext.isAuthenticated ? 370 : 340,
        })
        renderPlugin(<App context={pluginContext} />)
    } catch (error) {
        console.error("Plugin error:", error)

        const message = error instanceof Error ? error.message : String(error)
        framer.closePlugin("An unexpected error ocurred: " + message, {
            variant: "error",
        })
    }
}

runPlugin()