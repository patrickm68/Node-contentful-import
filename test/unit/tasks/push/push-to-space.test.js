import PQueue from 'p-queue'
import { each } from 'lodash/collection'

import pushToSpace from '../../../../lib/tasks/push-to-space/push-to-space'

import creation from '../../../../lib/tasks/push-to-space/creation'
import publishing from '../../../../lib/tasks/push-to-space/publishing'
import assets from '../../../../lib/tasks/push-to-space/assets'

jest.mock('../../../../lib/tasks/push-to-space/creation', () => ({
  createEntities: jest.fn(({ context }) => {
    // Actually return one content type to get editor interfaces imported
    if (context.type === 'ContentType') {
      return Promise.resolve([
        {
          sys: {
            id: 'someId',
            type: 'ContentType',
            publishedVersion: 1
          }
        }
      ])
    }
    return Promise.resolve([])
  }),
  createEntries: jest.fn(() => Promise.resolve([])),
  createLocales: jest.fn(() => Promise.resolve([]))
}))
jest.mock('../../../../lib/tasks/push-to-space/publishing', () => ({
  publishEntities: jest.fn(({ entities }) => {
    // Actually return one content type to get editor interfaces imported
    if (entities[0] && entities[0].sys.type === 'ContentType') {
      return Promise.resolve([{
        sys: {
          id: 'someId',
          type: 'ContentType'
        }
      }])
    }
    return Promise.resolve([])
  }),
  archiveEntities: jest.fn(() => Promise.resolve([])),
  unpublishEntities: jest.fn(() => Promise.resolve())
}))
jest.mock('../../../../lib/tasks/push-to-space/assets', () => ({
  processAssets: jest.fn(() => Promise.resolve([])),
  getAssetStreamForURL: jest.fn(() => Promise.resolve([]))
}))

const sourceData = {
  locales: [],
  contentTypes: [
    {
      original: {
        sys: {
          id: 'someId',
          type: 'ContentType',
          publishedVersion: 1
        }
      }
    }
  ],
  assets: [],
  editorInterfaces: [
    {
      sys: {
        type: 'EditorInterface',
        contentType: {
          sys: {
            id: 'someId'
          }
        }
      }
    }
  ],
  entries: []
}

const destinationData = {}

const editorInterfaceUpdateMock = jest.fn()

const clientMock = {
  getSpace: jest.fn(() => Promise.resolve({
    getEnvironment: jest.fn(() => Promise.resolve({
      getEditorInterfaceForContentType: () => {
        return Promise.resolve({
          sys: {
            type: 'EditorInterface',
            contentType: {
              sys: {
                id: 'someId'
              }
            }
          },
          update: editorInterfaceUpdateMock
        })
      },
      createUpload: () => Promise.resolve({
        sys: {
          id: 'id'
        }
      })
    }))
  }))
}

let requestQueue

beforeEach(() => {
  // We set a high interval cap here because with the amount of data to fetch
  // We will otherwise run into timeouts of the tests due to being rate limited
  requestQueue = new PQueue({
    interval: 1000,
    intervalCap: 1000
  })
})

afterEach(() => {
  each(creation, (fn) => fn.mockClear())
  each(publishing, (fn) => fn.mockClear())
  each(assets, (fn) => fn.mockClear())
  editorInterfaceUpdateMock.mockClear()
})

test('Push content to destination space', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    timeout: 40000,
    retryLimit: 20,
    requestQueue
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(4)
      expect(creation.createEntries.mock.calls).toHaveLength(1)
      expect(creation.createLocales.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(3)
      expect(publishing.archiveEntities.mock.calls).toHaveLength(2)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(1)
      expect(assets.getAssetStreamForURL.mock.calls).toHaveLength(0)
      expect(assets.processAssets.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls[0][0].retryLimit).toEqual(20)
      expect(assets.processAssets.mock.calls[0][0].timeout).toEqual(40000)
    })
})

test('Push only content types and locales to destination space', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    contentModelOnly: true,
    requestQueue
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(2)
      expect(creation.createEntries.mock.calls).toHaveLength(0)
      expect(creation.createLocales.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls).toHaveLength(0)
    })
})

test('Push only content types', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    contentModelOnly: true,
    skipLocales: true,
    requestQueue
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(2)
      expect(creation.createEntries.mock.calls).toHaveLength(0)
      expect(publishing.publishEntities.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(1)
      expect(assets.processAssets.mock.calls).toHaveLength(0)
    })
})

test('Push only entries and assets to destination space', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    skipContentModel: true,
    requestQueue
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(3)
      expect(creation.createEntries.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(2)
      expect(assets.processAssets.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(0)
    })
})

test('Push only entries and assets to destination space and skip publishing', () => {
  return pushToSpace({
    sourceData,
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    skipContentModel: true,
    skipContentPublishing: true,
    requestQueue
  })
    .run({ data: {} })
    .then(() => {
      expect(creation.createEntities.mock.calls).toHaveLength(3)
      expect(creation.createEntries.mock.calls).toHaveLength(1)
      expect(publishing.publishEntities.mock.calls).toHaveLength(0)
      expect(assets.processAssets.mock.calls).toHaveLength(1)
      expect(editorInterfaceUpdateMock.mock.calls).toHaveLength(0)
    })
})

test('Upload each local asset file before pushing to space', () => {
  const transformedAssets = [
    {
      transformed: {
        sys: {
          id: 'xxx',
          type: 'Asset'
        },
        fields: {
          file: {
            'en-US': {
              upload: 'https://images/contentful-en.jpg'
            },
            'de-DE': {
              upload: 'https://images/contentful-de.jpg'
            }
          }
        }
      },
      original: {
        sys: {
          id: 'xxx'
        }
      }
    }
  ]
  return pushToSpace({
    sourceData: { ...sourceData, assets: transformedAssets },
    destinationData,
    client: clientMock,
    spaceId: 'spaceid',
    environmentId: 'master',
    uploadAssets: true,
    assetsDirectory: 'assets',
    requestQueue
  })
    .run({ data: {} })
    .then(() => {
      expect(assets.getAssetStreamForURL.mock.calls).toHaveLength(2)
      expect(assets.getAssetStreamForURL).toHaveBeenCalledWith('https://images/contentful-en.jpg', 'assets')
      expect(assets.getAssetStreamForURL).toHaveBeenCalledWith('https://images/contentful-de.jpg', 'assets')
      expect(transformedAssets[0].transformed.fields.file['en-US']).not.toHaveProperty('upload')
      expect(transformedAssets[0].transformed.fields.file['en-US']).toHaveProperty('uploadFrom')
    })
})
