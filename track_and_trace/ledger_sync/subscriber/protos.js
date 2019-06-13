/**
 * Copyright 2018 Intel Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */
'use strict'

const path = require('path')
const _ = require('lodash')
const protobuf = require('protobufjs')

const protos = {}

const loadProtos = (filename, protoNames) => {
  const protoPath = path.resolve(__dirname, '../../protos', filename)
  return protobuf.load(protoPath)
    .then(root => {
      protoNames.forEach(name => {
        protos[name] = root.lookupType(name)
      })
    })
}

const compile = () => {
  return Promise.all([
    loadProtos('pike_payload.proto', [
      'PikePayload',
      'CreateAgentAction',
      'UpdateAgentAction',
      'CreateOrganizationAction',
      'UpdateOrganizationAction'
    ]),
    loadProtos('pike_state.proto', [
      'Agent',
      'AgentList',
      'KeyValueEntry',
      'Organization',
      'OrganizationList'
    ]),
    loadProtos('schema_payload.proto', [
      'SchemaPayload',
      'SchemaCreateAction',
      'SchemaUpdateAction'
    ]),
    loadProtos('schema_state.proto', [
      'PropertyDefinition',
      'Schema',
      'SchemaList',
      'LatLong',
      'PropertyValue'
    ]),
    loadProtos('track_and_trace_payload.proto', [
      'TrackAndTracePayload',
      'FinalizeRecordAction',
      'CreateRecordAction',
      'UpdatePropertiesAction',
      'CreateProposalAction',
      'AnswerProposalAction',
      'RevokeReporterAction'
    ]),
    loadProtos('track_and_trace_state.proto', [
      'Property',
      'PropertyList',
      'PropertyPage',
      'PropertyPageList',
      'Proposal',
      'ProposalList',
      'Record',
      'RecordList'
    ])
  ])
}

module.exports = _.assign(protos, { compile })
