import { GetDatabaseResponse } from "@notionhq/client/build/src/api-endpoints"
import { CollectionField } from "framer-plugin"
import { assert, isDefined } from "./utils"
import {
    PluginContext,
    SynchronizeMutationOptions,
    getCollectionFieldForProperty,
    hasFieldConfigurationChanged,
    pageContentField,
    richTextToPlainText,
} from "./notion"
import { Fragment, useState } from "react"
import classNames from "classnames"
import { IconChevron } from "./components/Icons"
import { Button } from "./components/Button"
import { isFullDatabase } from "@notionhq/client"

interface CollectionFieldConfig {
    field: CollectionField | null
    isNewField: boolean
    originalFieldName: string
}

function sortField(fieldA: CollectionFieldConfig, fieldB: CollectionFieldConfig): number {
    // Sort unsupported fields to bottom
    if (!fieldA.field && !fieldB.field) {
        return 0
    } else if (!fieldA.field) {
        return 1
    } else if (!fieldB.field) {
        return -1
    }

    return -1
}

function createFieldConfig(database: GetDatabaseResponse, pluginContext: PluginContext): CollectionFieldConfig[] {
    const result: CollectionFieldConfig[] = []

    const existingFieldIds = new Set(
        pluginContext.type === "new" ? [] : pluginContext.collectionFields.map(field => field.id)
    )

    result.push({
        field: pageContentField,
        originalFieldName: pageContentField.name,
        isNewField: existingFieldIds.size > 0 && !existingFieldIds.has(pageContentField.id),
    })

    for (const key in database.properties) {
        const property = database.properties[key]
        assert(property)

        if (property.type === "title") continue

        result.push({
            field: getCollectionFieldForProperty(property),
            originalFieldName: property.name,
            isNewField: existingFieldIds.size > 0 && !existingFieldIds.has(property.id),
        })
    }

    return result.sort(sortField)
}

function getFieldNameOverrides(pluginContext: PluginContext): Record<string, string> {
    const result: Record<string, string> = {}
    if (pluginContext.type === "new") return result

    for (const field of pluginContext.collectionFields) {
        result[field.id] = field.name
    }

    return result
}

export function MapDatabaseFields({
    database,
    onSubmit,
    isLoading,
    pluginContext,
}: {
    database: GetDatabaseResponse
    onSubmit: (options: SynchronizeMutationOptions) => void
    isLoading: boolean
    pluginContext: PluginContext
}) {
    const [fieldConfig] = useState<CollectionFieldConfig[]>(() => createFieldConfig(database, pluginContext))
    const [disabledFieldIds, setDisabledFieldIds] = useState(
        () => new Set<string>(pluginContext.type === "new" ? [] : pluginContext.ignoredFieldIds)
    )
    const [fieldNameOverrides, setFieldNameOverrides] = useState<Record<string, string>>(() =>
        getFieldNameOverrides(pluginContext)
    )

    assert(isFullDatabase(database))

    const handleFieldToggle = (key: string) => {
        setDisabledFieldIds(current => {
            const nextSet = new Set(current)
            if (nextSet.has(key)) {
                nextSet.delete(key)
            } else {
                nextSet.add(key)
            }

            return nextSet
        })
    }

    const handleFieldNameChange = (id: string, value: string) => {
        setFieldNameOverrides(current => ({
            ...current,
            [id]: value,
        }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (isLoading) return

        const allFields = fieldConfig
            .filter(fieldConfig => fieldConfig.field && !disabledFieldIds.has(fieldConfig.field.id))
            .map(fieldConfig => fieldConfig.field)
            .filter(isDefined)
            .map(field => {
                if (fieldNameOverrides[field.id]) {
                    field.name = fieldNameOverrides[field.id]
                }

                return field
            })

        // Always synchronize everything if field configuration changes.
        const lastSyncedTime =
            pluginContext.type === "new" ||
            hasFieldConfigurationChanged(pluginContext.collectionFields, database, Array.from(disabledFieldIds))
                ? null
                : pluginContext.lastSyncedTime

        onSubmit({
            fields: allFields,
            ignoredFieldIds: Array.from(disabledFieldIds),
            lastSyncedTime: lastSyncedTime,
        })
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 flex-1">
            <div className="h-[1px] border-b border-divider mb-2" />
            <div className="flex-1 flex flex-col gap-4">
                <div className="grid grid-cols-fieldPicker gap-3 w-full items-center justify-center">
                    <span className="col-start-2 col-span-2">Notion Property</span>
                    <span>Collection Field</span>
                    <input type="checkbox" readOnly checked={true} className="opacity-50 mx-auto" />
                    <input type="text" className="w-full opacity-50" disabled value={"Title"} />
                    <div className="flex items-center justify-center opacity-50">
                        <IconChevron />
                    </div>
                    <input type="" className={"w-full opacity-50"} disabled={true} placeholder={"Title"}></input>

                    {fieldConfig.map(fieldConfig => {
                        const isUnsupported = !fieldConfig.field

                        return (
                            <Fragment key={fieldConfig.originalFieldName}>
                                <input
                                    type="checkbox"
                                    disabled={!fieldConfig.field}
                                    checked={!!fieldConfig.field && !disabledFieldIds.has(fieldConfig.field.id)}
                                    className={classNames("mx-auto", isUnsupported && "opacity-50")}
                                    onChange={() => {
                                        assert(fieldConfig.field)

                                        handleFieldToggle(fieldConfig.field.id)
                                    }}
                                />
                                <input
                                    type="text"
                                    className={classNames("w-full", isUnsupported && "opacity-50")}
                                    disabled
                                    value={fieldConfig.originalFieldName}
                                />
                                <div
                                    className={classNames(
                                        "flex items-center justify-center",
                                        isUnsupported && "opacity-50"
                                    )}
                                >
                                    <IconChevron />
                                </div>
                                <input
                                    type=""
                                    className={classNames("w-full", isUnsupported && "opacity-50")}
                                    disabled={!fieldConfig.field || disabledFieldIds.has(fieldConfig.field.id)}
                                    placeholder={fieldConfig.originalFieldName}
                                    value={
                                        !fieldConfig.field
                                            ? "Unsupported Field"
                                            : fieldNameOverrides[fieldConfig.field.id] ?? ""
                                    }
                                    onChange={e => {
                                        assert(fieldConfig.field)

                                        handleFieldNameChange(fieldConfig.field.id, e.target.value)
                                    }}
                                ></input>
                            </Fragment>
                        )
                    })}
                </div>
            </div>

            <div className="left-0 bottom-0 w-full flex justify-between sticky bg-primary py-4 border-t border-divider border-opacity-20 items-center">
                <div className="inline-flex items-center gap-1">
                    <span className="text-tertiary">Importing from</span>
                    <a
                        href={database.url}
                        className="font-semibold text-secondary hover:text-primary"
                        target="_blank"
                        tabIndex={-1}
                    >
                        {richTextToPlainText(database.title)}
                    </a>
                </div>
                <Button variant="primary" isLoading={isLoading} className="w-auto">
                    Import
                </Button>
            </div>
        </form>
    )
}