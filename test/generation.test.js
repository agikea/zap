/**
 * @jest-environment node
 */

/*
* Created Date: Wednesday, March 18th 2020, 10:08 am
* Author: Bharat Dandu
* 
* Copyright (c) 2020 Silicon Labs
*/

import axios from 'axios'
import fs from "fs"
import { version } from '../package.json'
import { closeDatabase, initDatabase, loadSchema } from "../src-electron/db/db-api"
import { selectCountFrom } from "../src-electron/db/query"
import { logError, logInfo, schemaFile, setDevelopmentEnv, sqliteTestFile } from "../src-electron/main-process/env"
import { initHttpServer, shutdownHttpServer } from "../src-electron/server/http-server"
import { loadZcl } from "../src-electron/zcl/zcl-loader"
import { zclPropertiesFile } from '../src-electron/main-process/args'

var db
const port = 9074
const baseUrl = `http://localhost:${port}`
var packageId
var sessionId

beforeAll(() => {
    setDevelopmentEnv()
    var file = sqliteTestFile(3)
    return initDatabase(file)
        .then(d => loadSchema(d, schemaFile(), version))
        .then(d => { db = d; logInfo(`Test database initialized: ${file}.`) })
        .catch(err => logError(`Error: ${err}`))
})

afterAll(() => {
    return shutdownHttpServer()
        .then(() => closeDatabase(db))
        .then(() => {
            var file = sqliteTestFile(3)
            logInfo(`Removing test database: ${file}`)
            if (fs.existsSync(file)) fs.unlinkSync(file)
        })
})

describe('Session specific tests', () => {

    test('make sure there is no session at the beginning', () => {
        return selectCountFrom(db, "SESSION")
            .then(cnt => {
                expect(cnt).toBe(0)
            })
    })

    test('Now actually load the static data.', () => {
        return loadZcl(db, zclPropertiesFile)
    }, 6000)

    test('http server initialization', () => {
        return initHttpServer(db, port)
    })

    test('test that there is generation data in the enums.h file', () => {
        return axios.get(`${baseUrl}/preview/enums`)
          .then((response) => {
            expect(response.data).toMatch(/EMBER_ZCL_11073_CONNECT_REQUEST_CONNECT_CONTROL_PREEMPTIBLE = 0x01/);
            expect(response.data).toMatch(/\#define EMBER_AF_ALARM_MASK_GENERAL_HW_FAULT \(0x1\)/);
          })
    })
    
    test('test that there is generation data in the cluster-id.h file', () => {
        return axios.get(`${baseUrl}/preview/clusters`)
          .then((response) => {
            expect(response.data).toMatch(/\#define ZCL_BASIC_CLUSTER_ID 0x0000/);
          })
    })
})