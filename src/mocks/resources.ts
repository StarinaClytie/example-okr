import type { Resource, ResourceDetail, ResourceProblem } from '../data/types';

// Representative demo inventory. Mutations remain unsupported in demo mode
// (matching the existing DemoOkrRepository convention); these fixtures only make
// the Resources list and detail pages render a realistic read-only preview.

export const mockResources: Resource[] = [
  {
    id: 'resource-demo-laptop',
    name: 'Demo Laptop',
    category: 'electronics',
    resourceKind: 'durable',
    description: 'Fictional shared laptop for software demos.',
    ownerId: 'user-project-leader',
    ownerName: '李然',
    location: 'Office / Cabinet A / Shelf 1',
    purchaseDate: '2026-05-12',
    purchaseVendor: 'Example Supplier',
    purchaseReference: 'https://app.example.com/suppliers',
    usageNotes: 'Return to the shared storage cabinet after use.',
    manualUrl: 'https://app.example.com/manuals/demo-laptop',
    quantity: 1,
    unit: null,
    status: 'available',
    createdAt: '2026-05-12T08:00:00Z',
    updatedAt: '2026-06-02T09:30:00Z',
    archivedAt: null,
  },
  {
    id: 'resource-meeting-display',
    name: 'Meeting Room Display',
    category: 'electronics',
    resourceKind: 'durable',
    description: 'Fictional shared display for team meetings.',
    ownerId: 'user-employee',
    ownerName: '周琳',
    location: 'Office / Meeting Room B',
    purchaseDate: '2026-03-01',
    purchaseVendor: 'Example Supplier',
    purchaseReference: null,
    usageNotes: 'Connect the display cable before the meeting.',
    manualUrl: null,
    quantity: 1,
    unit: null,
    status: 'in_use',
    createdAt: '2026-03-01T10:00:00Z',
    updatedAt: '2026-07-18T14:00:00Z',
    archivedAt: null,
  },
  {
    id: 'resource-network-toolkit',
    name: 'Network Toolkit',
    category: 'tools',
    resourceKind: 'durable',
    description: 'Basic toolkit for office network equipment.',
    ownerId: 'user-management',
    ownerName: '王敏',
    location: 'Office / Cabinet A / Shelf 3',
    purchaseDate: null,
    purchaseVendor: 'Local supplier',
    purchaseReference: null,
    usageNotes: null,
    manualUrl: null,
    quantity: 1,
    unit: null,
    status: 'available',
    createdAt: '2026-04-20T09:00:00Z',
    updatedAt: '2026-04-20T09:00:00Z',
    archivedAt: null,
  },
  {
    id: 'resource-printer-paper',
    name: 'Printer Paper',
    category: 'consumables',
    resourceKind: 'consumable',
    description: 'A4 paper for the shared office printer.',
    ownerId: 'user-employee',
    ownerName: '周琳',
    location: 'Office / Stationery Shelf C',
    purchaseDate: '2026-07-10',
    purchaseVendor: 'Example Supplier',
    purchaseReference: null,
    usageNotes: 'Store in a dry cabinet.',
    manualUrl: null,
    quantity: 500,
    unit: 'sheets',
    status: 'available',
    createdAt: '2026-07-10T08:00:00Z',
    updatedAt: '2026-07-10T08:00:00Z',
    archivedAt: null,
  },
];

const problemsByResource: Record<string, ResourceProblem[]> = {
  'resource-meeting-display': [
    {
      id: 'problem-display-location',
      problemType: 'location_incorrect',
      description: '在 Office / Meeting Room B 没有找到该真空泵。',
      status: 'resolved',
      reporterId: 'user-project-peer',
      reporterName: '赵峰',
      reportedAt: '2026-07-15T10:00:00Z',
      resolvedAt: '2026-07-15T16:00:00Z',
      resolvedBy: 'user-employee',
      resolvedByName: '周琳',
      resolutionNote: 'Moved to Office / Meeting Room C. Resource location updated.',
      notificationStatus: 'sent',
      notificationErrorCode: null,
    },
    {
      id: 'problem-display-malfunction',
      problemType: 'malfunction',
      description: '显示器启动后画面闪烁。',
      status: 'open',
      reporterId: 'user-project-leader',
      reporterName: '李然',
      reportedAt: '2026-08-02T11:00:00Z',
      resolvedAt: null,
      resolvedBy: null,
      resolvedByName: null,
      resolutionNote: null,
      notificationStatus: 'failed',
      notificationErrorCode: 'email_not_configured',
    },
  ],
};

const attachmentNames: Record<string, Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>> = {
  'resource-demo-laptop': [
    { id: 'attachment-laptop-manual', fileName: 'demo-laptop-manual.pdf', mimeType: 'application/pdf', sizeBytes: 102400 },
  ],
};

export function getMockResourceDetail(resourceId: string): ResourceDetail | null {
  const resource = mockResources.find((candidate) => candidate.id === resourceId);
  if (!resource) return null;
  const problems = problemsByResource[resourceId] ?? [];
  const attachments = (attachmentNames[resourceId] ?? []).map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: resource.createdAt,
  }));
  return { ...resource, attachments, problems };
}
