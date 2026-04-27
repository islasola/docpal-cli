const MANUALS_TABLE = 'tblManuals';

const TABLE_SCHEMAS = [
    {
        name: MANUALS_TABLE,
        fields: [
            { field_name: 'Name', type: 1 },
            { field_name: 'Root Type', type: 3, property: { options: [
                { name: 'Wiki Space', color: 0 },
                { name: 'Drive Folder', color: 1 }
            ]}},
            { field_name: 'Root Token', type: 1 },
            { field_name: 'Default Publish Target', type: 4, property: { options: [] }},
            { field_name: 'Description', type: 1 },
        ],
        linkFields: []
    },
    {
        name: 'Docs',
        fields: [
            { field_name: 'Doc', type: 15 },
            { field_name: 'Slug', type: 1 },
            { field_name: 'Parent Token', type: 1 },
            { field_name: 'Status', type: 3, property: { options: [
                { name: 'Draft', color: 0 },
                { name: 'In Review', color: 1 },
                { name: 'Approved', color: 2 },
                { name: 'Published', color: 3 },
                { name: 'Deprecated', color: 4 }
            ]}},
            { field_name: 'Progress', type: 3, property: { options: [
                { name: 'Not Started', color: 0 },
                { name: 'Writing', color: 1 },
                { name: 'Reviewing', color: 2 },
                { name: 'Ready', color: 3 },
                { name: 'Published', color: 4 }
            ]}},
            { field_name: 'Publish Targets', type: 4, property: { options: [
                { name: 'Zilliz.SaaS', color: 0 },
                { name: 'Zilliz.PaaS', color: 1 },
                { name: 'Zilliz', color: 2 },
                { name: 'Milvus', color: 3 }
            ]}},
            { field_name: 'Type', type: 3, property: { options: [
                { name: 'Doc', color: 0 },
                { name: 'API Ref', color: 1 },
                { name: 'FAQ', color: 2 },
                { name: 'Blog', color: 3 }
            ]}},
            { field_name: 'Added Since', type: 1 },
            { field_name: 'Deprecated Since', type: 1 },
            { field_name: 'Beta', type: 7 },
            { field_name: 'Notebook', type: 7 },
            { field_name: 'Keywords', type: 1 },
            { field_name: 'Sidebar Label', type: 1 },
            { field_name: 'Sidebar Position', type: 2 },
            { field_name: 'Content Hash', type: 1 },
            { field_name: 'Last Sync SHA', type: 1 },
            { field_name: 'Last Published At', type: 5 },
            { field_name: 'Sync Status', type: 3, property: { options: [
                { name: 'Draft', color: 0 },
                { name: 'Approved', color: 1 },
                { name: 'Published', color: 2 },
                { name: 'Synced', color: 3 },
                { name: 'Deprecated', color: 4 }
            ]}},
        ],
        linkFields: []
    },
    {
        name: 'Publish Targets',
        fields: [
            { field_name: 'Name', type: 1 },
            { field_name: 'Repo', type: 1 },
            { field_name: 'Base Branch', type: 1 },
            { field_name: 'Output Path', type: 1 },
            { field_name: 'Branch Prefix', type: 1 },
            { field_name: 'Auto Merge', type: 7 },
            { field_name: 'Displayed Sidebar', type: 1 },
        ],
        linkFields: []
    },
    {
        name: 'Doc Publish Paths',
        fields: [
            { field_name: 'Repo Path', type: 1 },
            { field_name: 'Open PR', type: 1 },
            { field_name: 'Last Merged PR', type: 1 },
            { field_name: 'Last Published At', type: 5 },
            { field_name: 'Status', type: 3, property: { options: [
                { name: 'Not Published', color: 0 },
                { name: 'PR Open', color: 1 },
                { name: 'Merged', color: 2 },
                { name: 'Closed', color: 3 }
            ]}},
        ],
        linkFields: []
    },
    {
        name: 'Pull Requests',
        fields: [
            { field_name: 'PR URL', type: 1 },
            { field_name: 'PR Number', type: 2 },
            { field_name: 'Branch', type: 1 },
            { field_name: 'Status', type: 3, property: { options: [
                { name: 'Open', color: 0 },
                { name: 'Merged', color: 1 },
                { name: 'Closed', color: 2 }
            ]}},
            { field_name: 'Author', type: 1 },
            { field_name: 'Created At', type: 5 },
            { field_name: 'Merged At', type: 5 },
        ],
        linkFields: []
    },
    {
        name: 'Versions',
        fields: [
            { field_name: 'Version', type: 1 },
            { field_name: 'Tag Name', type: 1 },
            { field_name: 'Commit SHA', type: 1 },
            { field_name: 'Published At', type: 5 },
        ],
        linkFields: []
    },
    {
        name: 'Sync History',
        fields: [
            { field_name: 'Action', type: 3, property: { options: [
                { name: 'Pushed to Feishu', color: 0 },
                { name: 'Published to GitHub', color: 1 },
                { name: 'Synced from GitHub', color: 2 }
            ]}},
            { field_name: 'Timestamp', type: 5 },
            { field_name: 'Details', type: 1 },
        ],
        linkFields: []
    },
];

const LINK_FIELDS = [
    { table: 'Docs', field_name: 'Manual', linked_table: MANUALS_TABLE, multiple: false },
    { table: 'Publish Targets', field_name: 'Manual', linked_table: MANUALS_TABLE, multiple: false },
    { table: 'Doc Publish Paths', field_name: 'Doc', linked_table: 'Docs', multiple: false },
    { table: 'Doc Publish Paths', field_name: 'Target', linked_table: 'Publish Targets', multiple: false },
    { table: 'Doc Publish Paths', field_name: 'Manual', linked_table: MANUALS_TABLE, multiple: false },
    { table: 'Pull Requests', field_name: 'Doc', linked_table: 'Docs', multiple: false },
    { table: 'Pull Requests', field_name: 'Target', linked_table: 'Publish Targets', multiple: false },
    { table: 'Pull Requests', field_name: 'Doc Publish Path', linked_table: 'Doc Publish Paths', multiple: false },
    { table: 'Pull Requests', field_name: 'Manual', linked_table: MANUALS_TABLE, multiple: false },
    { table: 'Versions', field_name: 'Publish Target', linked_table: 'Publish Targets', multiple: false },
    { table: 'Versions', field_name: 'Docs', linked_table: 'Docs', multiple: true },
    { table: 'Versions', field_name: 'Manual', linked_table: MANUALS_TABLE, multiple: false },
    { table: 'Sync History', field_name: 'Doc', linked_table: 'Docs', multiple: false },
    { table: 'Sync History', field_name: 'Manual', linked_table: MANUALS_TABLE, multiple: false },
];

module.exports = { MANUALS_TABLE, TABLE_SCHEMAS, LINK_FIELDS };