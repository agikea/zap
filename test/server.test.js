/**
 * @jest-environment node
 */

/*
 * Created Date: Saturday, March 14th 2020, 1:23:01 am
 * Author: Timotej Ecimovic
 *
 * Copyright (c) 2020 Silicon Labs
 */

import {
  initHttpServer,
  shutdownHttpServer,
} from '../src-electron/server/http-server'
import {
  initDatabase,
  closeDatabase,
  loadSchema,
} from '../src-electron/db/db-api'
import {
  logError,
  setDevelopmentEnv,
  sqliteTestFile,
  logInfo,
  appDirectory,
  schemaFile,
} from '../src-electron/util/env'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { version } from '../package.json'
import { selectCountFrom } from '../src-electron/db/query-generic'
import { getAllSessions, deleteSession } from '../src-electron/db/query-session'
import { insertPathCrc } from '../src-electron/db/query-package'
import { insertClusters, insertDomains } from '../src-electron/db/query-zcl'
import { exportDataIntoFile } from '../src-electron/importexport/export'
import { importDataFromFile } from '../src-electron/importexport/import'

var db
const port = 9073
const baseUrl = `http://localhost:${port}`
var packageId
var sessionId, secondSessionId
var sessionCookie = null
var axiosInstance = null

beforeAll(() => {
  setDevelopmentEnv()
  var file = sqliteTestFile(2)
  axiosInstance = axios.create({ baseURL: baseUrl })
  return initDatabase(file)
    .then((d) => loadSchema(d, schemaFile(), version))
    .then((d) => {
      db = d
      logInfo(`Test database initialized: ${file}.`)
    })
    .catch((err) => logError(`Error: ${err}`))
})

afterAll(() => {
  return shutdownHttpServer()
    .then(() => closeDatabase(db))
    .then(() => {
      var file = sqliteTestFile(2)
      logInfo(`Removing test database: ${file}`)
      if (fs.existsSync(file)) fs.unlinkSync(file)
    })
})

describe('Session specific tests', () => {
  test('make sure there is no session at the beginning', () => {
    return selectCountFrom(db, 'SESSION').then((cnt) => {
      expect(cnt).toBe(0)
    })
  })

  test('http server initialization', () => {
    return initHttpServer(db, port)
  })

  test('get index.html', () => {
    return axiosInstance.get('/index.html').then((response) => {
      sessionCookie = response.headers['set-cookie'][0]
      axiosInstance.defaults.headers.Cookie = sessionCookie
      expect(
        response.data.includes(
          'Configuration tool for the Zigbee Cluster Library'
        )
      ).toBeTruthy()
    })
  })

  test('make sure there is 1 session after index.html', () => {
    return selectCountFrom(db, 'SESSION').then((cnt) => {
      expect(cnt).toBe(1)
    })
  })

  test('save session', () => {
    return getAllSessions(db).then((results) => {
      sessionId = results[0].sessionId
      logInfo(`SESSION ID: ${sessionId}`)
    })
  })

  test('test that there is 0 clusters initially', () => {
    return axiosInstance.get('/get/cluster/all').then((response) => {
      expect(response.data.data.length).toBe(0)
      expect(response.data.type).toBe('cluster')
    })
  })

  test('make sure there is still 1 session after previous call', () => {
    return selectCountFrom(db, 'SESSION').then((cnt) => {
      expect(cnt).toBe(1)
    })
  })

  test('add a package', () => {
    return insertPathCrc(db, 'PATH', 32).then((pkg) => {
      packageId = pkg
    })
  })

  test('load 2 clusters', () => {
    return insertClusters(db, packageId, [
      {
        code: 0x1111,
        name: 'One',
        description: 'Cluster one',
        define: 'ONE',
      },
      {
        code: 0x2222,
        name: 'Two',
        description: 'Cluster two',
        define: 'TWO',
      },
    ])
  })

  test('test that there are 2 clusters now', () => {
    return axiosInstance.get('/get/cluster/all').then((response) => {
      expect(response.data.data.length).toBe(2)
      expect(response.data.type).toBe('cluster')
    })
  })

  test('make sure there is still 1 session after previous call', () => {
    return selectCountFrom(db, 'SESSION').then((cnt) => {
      expect(cnt).toBe(1)
    })
  })

  test('load domains', () => {
    return insertDomains(db, packageId, [
      { name: 'one' },
      { name: 'two' },
      { name: 'three' },
      { name: 'four' },
    ])
  })

  test('test that there are domains', () => {
    return axiosInstance.get('/get/domain/all').then((response) => {
      expect(response.data.data.length).toBe(4)
      expect(response.data.type).toBe('domain')
    })
  })

  // We save and then load, which creates a new session.
  test('save into a file and load from file', () => {
    var f = path.join(appDirectory(), 'test-output.json')
    if (fs.existsSync(f)) fs.unlinkSync(f)
    expect(fs.existsSync(f)).toBeFalsy()
    return exportDataIntoFile(db, sessionId, f)
      .then(() => {
        expect(fs.existsSync(f)).toBeTruthy()
      })
      .then(() => importDataFromFile(db, f))
      .then((nextSessionId) => {
        secondSessionId = nextSessionId
        fs.unlinkSync(f)
        return Promise.resolve(1)
      })
  })

  // After a new file is loaded a new session will be created.
  // Therefore, at this point, there have to be EXACTLY 2 sessions.
  test('make sure there is now 2 sessions after previous call', () => {
    return selectCountFrom(db, 'SESSION').then((cnt) => {
      expect(cnt).toBe(2)
    })
  })

  test('delete the first session', () => {
    return deleteSession(db, sessionId)
      .then(() => selectCountFrom(db, 'SESSION'))
      .then((cnt) => {
        expect(cnt).toBe(1)
      })
  })

  test('delete the second session', () => {
    return deleteSession(db, secondSessionId)
      .then(() => selectCountFrom(db, 'SESSION'))
      .then((cnt) => {
        expect(cnt).toBe(0)
      })
  })
})

describe('Admin tests', () => {
  test('test sql admin interface', () => {
    return axiosInstance
      .post('/post/sql', { sql: 'SELECT * FROM PACKAGE' })
      .then((response) => {
        expect(response).not.toBeNull()
        expect(response.data.result).not.toBeNull()
        expect(response.data.replyId).toBe('sql-result')
      })
  })
})
