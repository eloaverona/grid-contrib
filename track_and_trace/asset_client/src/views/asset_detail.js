/**
 * Copyright 2017 Intel Corporation
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

const m = require('mithril')
const moment = require('moment')
const truncate = require('lodash/truncate')

const {MultiSelect} = require('../components/forms')
const { Proposal, PropertyDefinition } = require('../protobuf')
const parsing = require('../services/parsing')
const transactions = require('../services/transactions')
const api = require('../services/api')
const auth = require('../services/auth')
const records = require('../services/records')
const agents = require('../services/agents')
const {
  getPropertyValue,
  getLatestUpdateTime,
  getOldestPropertyUpdateTime,
  isReporter
} = require('../utils/records')

/**
 * Possible selection options
 */
const authorizableProperties = [
  'weight',
  'location'
]

const _labelProperty = (label, value) => [
  m('dl',
    m('dt', label),
    m('dd', value))
]

const _row = (...cols) =>
  m('.row',
    cols
    .filter((col) => col !== null)
    .map((col) => m('.col', col)))

const TransferDropdown = {
  view (vnode) {
    // Default to no-op
    let onsuccess = vnode.attrs.onsuccess || (() => null)
    let record = vnode.attrs.record
    let role = vnode.attrs.role
    let publicKey = vnode.attrs.publicKey
    let signer = vnode.attrs.signer
    return [
      m('.dropdown',
        m('button.btn.btn-primary.btn-block.dropdown-toggle.text-left',
          { 'data-toggle': 'dropdown' },
          vnode.children),
        m('.dropdown-menu',
          vnode.attrs.agents.map(agent => {
            let proposal = _getProposal(record, agent.public_key, role)
            return [
              m("a.dropdown-item[href='#']", {
                onclick: (e) => {
                  e.preventDefault()
                  if (proposal && proposal.issuingAgent === publicKey) {
                    _answerProposal(record, agent.public_key, ROLE_TO_ENUM[role],
                                    Proposal.Role.CANCEL)
                      .then(onsuccess)
                  } else {
                    _submitProposal(record, ROLE_TO_ENUM[role], publicKey, signer)
                      .then(onsuccess)
                  }
                }
              }, m('span.text-truncate',
                   truncate(agent.public_key, { length: 32 }),
                   (proposal ? ' \u2718' : '')))
            ]
          })))
    ]
  }
}

const ROLE_TO_ENUM = {
  'owner': Proposal.Role.OWNER,
  'custodian': Proposal.Role.CUSTODIAN,
  'reporter': Proposal.Role.REPORTER
}

const TransferControl = {
  view (vnode) {
    let {record, agents, publicKey, role, label, signer} = vnode.attrs
    if (record.final) {
      return null
    }

    let onsuccess = vnode.attrs.onsuccess || (() => null)
    if (record[role] === publicKey) {
      return [
        m(TransferDropdown, {
          publicKey,
          agents,
          record,
          role,
          signer,
          onsuccess
        }, `Transfer ${label}`)
      ]
    } else if (_hasProposal(record, publicKey, role)) {
      return [
        m('.d-flex.justify-content-start',
          m('button.btn.btn-primary', {
            onclick: (e) => {
              e.preventDefault()
              _answerProposal(record, publicKey, ROLE_TO_ENUM[role],
                              Proposal.Role.ACCEPT)

                .then(onsuccess)
            }
          },
          `Accept ${label}`),
          m('button.btn.btn-danger.ml-auto', {
            onclick: (e) => {
              e.preventDefault()
              _answerProposal(record, publicKey, ROLE_TO_ENUM[role],
                              Proposal.Role.REJECT)
                .then(onsuccess)
            }
          },
          `Reject`))
      ]
    } else {
      return null
    }
  }
}

const _getProposal = (record, receivingAgent, role) =>
  record.proposals.find(
    (proposal) => (proposal.role.toLowerCase() === role && proposal.receivingAgent === receivingAgent))

const _hasProposal = (record, receivingAgent, role) =>
  !!_getProposal(record, receivingAgent, role)

const ReporterControl = {
  view (vnode) {
    let {record, agents, publicKey} = vnode.attrs
    if (record.final) {
      return null
    }

    let onsuccess = vnode.attrs.onsuccess || (() => null)
    if (record.owner === publicKey) {
      return [
        m(AuthorizeReporter, {
          record,
          agents,
          onsubmit: ([publicKey, properties]) =>
          _authorizeReporter(record, publicKey, properties).then(onsuccess)
        }),

        // Outstanding reporters
        Object.entries(_reporters(record))
        .filter(([key, _]) => key !== publicKey)
        .map(([key, properties]) => {
          return [
            m('.mt-2.d-flex.justify-content-start',
              `${_agentByKey(agents, key).name} authorized for ${properties}`,
              m('.button.btn.btn-outline-danger.ml-auto', {
                onclick: (e) => {
                  e.preventDefault()
                  _revokeAuthorization(record, key, properties)
                    .then(onsuccess)
                }
              },
              'Revoke Authorization'))
          ]
        }),

        // Pending authorizations
        record.proposals.filter((p) => p.role === 'REPORTER' && p.issuingAgent === publicKey).map(
          (p) =>
            m('.mt-2.d-flex.justify-content-start',
              `Pending proposal for ${_agentByKey(agents, p.receivingAgent).name} on ${p.properties}`,
              m('.button.btn.btn-outline-danger.ml-auto',
                {
                  onclick: (e) => {
                    e.preventDefault()
                    _answerProposal(record, p.receivingAgent, ROLE_TO_ENUM['reporter'],
                                    payloads.answerProposal.enum.CANCEL)
                      .then(onsuccess)
                  }
                },
                'Rescind Proposal')))

      ]
    } else if (_hasProposal(record, publicKey, 'reporter')) {
      let proposal = _getProposal(record, publicKey, 'reporter')
      return [
        m('.d-flex.justify-content-start',
          m('button.btn.btn-primary', {
            onclick: (e) => {
              e.preventDefault()
              _answerProposal(record, publicKey, ROLE_TO_ENUM['reporter'],
                              payloads.answerProposal.enum.ACCEPT)
                .then(onsuccess)
            }
          },
          `Accept Reporting Authorization for ${proposal.properties}`),
          m('button.btn.btn-danger.ml-auto', {
            onclick: (e) => {
              e.preventDefault()
              _answerProposal(record, publicKey, ROLE_TO_ENUM['reporter'],
                              payloads.answerProposal.enum.REJECT)
                .then(onsuccess)
            }
          },
          `Reject`))
      ]
    } else {
      return null
    }
  }
}

/**
 * Returns a map of reporter key, to authorized fields
 */
const _reporters = (record) =>
  record.properties.reduce((acc, property) => {
    return property.reporters.reduce((acc, key) => {
      let props = (acc[key] || [])
      props.push(property.name)
      acc[key] = props
      return acc
    }, acc)
  }, {})

const _agentLink = (key) =>
  m(`a[href=/agents/${key}]`,
    { oncreate: m.route.link },
    truncate(key, {length: 24}))

const _propLink = (record, propName, content) =>
  m(`a[href=/assets/${record.recordId}/${propName}]`,
    { oncreate: m.route.link },
    content)

const ReportWeight = {
  view: (vnode) => {
    let onsuccess = vnode.attrs.onsuccess || (() => null)
    return [
      m('form', {
        onsubmit: (e) => {
          e.preventDefault()
          _updateProperty(vnode.attrs.record, {
              name: 'weight',
              dataType: PropertyDefinition.DataType.NUMBER,
              numberValue: parseFloat(vnode.state.weight) * 1000000
            },
            vnode.attrs.signer
          )
          .then(() => {
            vnode.state.weight = ''
          })
          .then(onsuccess)
        }
      },
      m('.form-row',
        m('.form-group.col-5',
          m('label.sr-only', { 'for': 'weight' }, 'Weight'),
          m('input.form-control[type="text"]', {
            name: 'weight',
            type: 'number',
            step: 'any',
            min: 0,
            onchange: m.withAttr('value', (value) => {
              vnode.state.weight = value
            }),
            value: vnode.state.weight,
            placeholder: 'Weight'
          })),
        m('.col-2',
          m('button.btn.btn-primary', 'Update'))))
    ]
  }
}

const ReportLocation = {
  view: (vnode) => {
    let onsuccess = vnode.attrs.onsuccess || (() => null)
    return [
      m('form', {
        onsubmit: (e) => {
          e.preventDefault()
          _updateProperty(vnode.attrs.record, {
              name: 'location',
              latLongValue: {
                latitude: parseFloat(vnode.state.latitude) * 1000000,
                longitude: parseFloat(vnode.state.longitude) * 1000000
              },
              dataType: PropertyDefinition.DataType.LAT_LONG
            },
            vnode.attrs.signer
          )
          .then(() => {
            vnode.state.latitude = ''
            vnode.state.longitude = ''
          })
          .then(onsuccess)
        }
      },
      m('.form-row',
        m('.form-group.col-5',
          m('label.sr-only', { 'for': 'latitude' }, 'Latitude'),
          m("input.form-control[type='text']", {
            name: 'latitude',
            type: 'number',
            step: 'any',
            min: -90,
            max: 90,
            onchange: m.withAttr('value', (value) => {
              vnode.state.latitude = value
            }),
            value: vnode.state.latitude,
            placeholder: 'Latitude'
          })),
        m('.form-group.col-5',
          m('label.sr-only', { 'for': 'longitude' }, 'Longitude'),
          m("input.form-control[type='text']", {
            name: 'longitude',
            type: 'number',
            step: 'any',
            min: -180,
            max: 180,
            onchange: m.withAttr('value', (value) => {
              vnode.state.longitude = value
            }),
            value: vnode.state.longitude,
            placeholder: 'Longitude'
          })),

        m('.col-2',
          m('button.btn.btn-primary', 'Update'))))
    ]
  }
}

const ReportValue = {
  view: (vnode) => {
    let onsuccess = vnode.attrs.onsuccess || (() => null)
    let xform = vnode.attrs.xform || ((x) => x)
    return [
      m('form', {
        onsubmit: (e) => {
          e.preventDefault()
          _updateProperty(vnode.attrs.record, {
            name: vnode.attrs.name,
            [vnode.attrs.typeField]: xform(vnode.state.value),
            dataType: vnode.attrs.type
          }).then(() => {
            vnode.state.value = ''
          })
          .then(onsuccess)
        }
      },
        m('.form-row',
          m('.form-group.col-10',
            m('label.sr-only', { 'for': vnode.attrs.name }, vnode.attrs.label),
            m("input.form-control[type='text']", {
              name: vnode.attrs.name,
              onchange: m.withAttr('value', (value) => {
                vnode.state.value = value
              }),
              value: vnode.state.value,
              placeholder: vnode.attrs.label
            })),
         m('.col-2',
           m('button.btn.btn-primary', 'Update'))))
    ]
  }
}

const AuthorizeReporter = {
  oninit (vnode) {
    vnode.state.properties = []
  },

  view (vnode) {
    return [
      _row(m('strong', 'Authorize Reporter')),
      m('.row',
        m('.col-6',
          m('input.form-control', {
            type: 'text',
            placeholder: 'Add reporter by name or public key...',
            value: vnode.state.reporter,
            oninput: m.withAttr('value', (value) => {
              // clear any previously matched values
              vnode.state.reporterKey = null
              vnode.state.reporter = value
              let reporter = vnode.attrs.agents.find(
                (agent) => agent.name === value || agent.key === value)
              if (reporter) {
                vnode.state.reporterKey = reporter.key
              }
            })
          })),

        m('.col-4',
          m(MultiSelect, {
            label: 'Select Fields',
            color: 'primary',
            options: authorizableProperties,
            selected: vnode.state.properties,
            onchange: (selection) => {
              vnode.state.properties = selection
            }
          })),

        m('.col-2',
          m('button.btn.btn-primary',
            {
              disabled: (!vnode.state.reporterKey || vnode.state.properties.length === 0),
              onclick: (e) => {
                e.preventDefault()
                vnode.attrs.onsubmit([vnode.state.reporterKey, vnode.state.properties])
                vnode.state.reporterKey = null
                vnode.state.reporter = null
                vnode.state.properties = []
              }
            },
            'Authorize')))
    ]
  }
}

const AssetDetail = {
  oninit (vnode) {
    _loadData(vnode.attrs.recordId, vnode.state)
    // vnode.state.refreshId = setInterval(() => {
    //   _loadData(vnode.attrs.recordId, vnode.state)
    // }, 2000)
  },

  onbeforeremove (vnode) {
    clearInterval(vnode.state.refreshId)
  },

  view (vnode) {
    if (!vnode.state.record) {
      return m('.alert-warning', `Loading ${vnode.attrs.recordId}`)
    }

    let publicKey = api.getPublicKey()
    let owner = vnode.state.owner
    let custodian = vnode.state.custodian
    let record = vnode.state.record
    let signer = vnode.state.signer
    return [
      m('.asset-detail',
        m('h1.text-center', record.recordId),
        _row(
          _labelProperty('Created',
                         _formatTimestamp(getOldestPropertyUpdateTime(record))),
          _labelProperty('Updated',
                         _formatTimestamp(getLatestUpdateTime(record)))),

        _row(
          _labelProperty('Owner', (owner.public_key ? _agentLink(owner.public_key) : '')),
          m(TransferControl, {
            publicKey,
            record,
            agents: vnode.state.agents,
            role: 'owner',
            label: 'Ownership',
            signer,
            onsuccess: () => _loadData(vnode.attrs.recordId, vnode.state)
          })),

        _row(
          _labelProperty('Custodian', _agentLink(custodian.public_key)),
          m(TransferControl, {
            publicKey,
            record,
            agents: vnode.state.agents,
            role: 'custodian',
            label: 'Custodianship',
            signer,
            onsuccess: () => _loadData(vnode.attrs.recordId, vnode.state)
          })),

        _row(
          _labelProperty('Type', getPropertyValue(record, 'type'))),
        _row(
          _labelProperty('Weight', _formatWeight(getPropertyValue(record, 'weight'))),
          (isReporter(record, 'weight', publicKey) && !record.final
           ? m(ReportWeight, { record, onsuccess: () => _loadData(record.record_id, vnode.state), signer })
           : null)),

        _row(
          _labelProperty(
            'Location',
            _propLink(record, 'location', _formatLocation(getPropertyValue(record, 'location')))
          ),
          (isReporter(record, 'location', publicKey) && !record.final
           ? m(ReportLocation, { record, onsuccess: () => _loadData(record.record_id, vnode.state), signer })
           : null)),

        _row(m(ReporterControl, {
          record,
          publicKey,
          agents: vnode.state.agents,
          onsuccess: () => _loadData(vnode.attrs.recordId, vnode.state)
        })),

        ((record.owner === publicKey && !record.final)
         ? m('.row.m-2',
             m('.col.text-center',
               m('button.btn.btn-danger', {
                 onclick: (e) => {
                   e.preventDefault()
                   _finalizeRecord(record, signer).then(() =>
                     _loadData(vnode.attrs.recordId, vnode.state))
                 }
               },
               'Finalize')))
         : '')
       )
    ]
  }
}

const _formatValue = (record, propName) => {
  let prop = getPropertyValue(record, propName)
  if (prop) {
    return parsing.stringifyValue(parsing.floatifyValue(prop), '***', propName)
  } else {
    return 'N/A'
  }
}

const _formatLocation = (location) => {
  if (location && location.latitude !== undefined && location.longitude !== undefined) {
    let latitude = parsing.toFloat(location.latitude)
    let longitude = parsing.toFloat(location.longitude)
    return `${latitude}, ${longitude}`
  } else {
    return 'Unknown'
  }
}

const _formatWeight = (weight) => `${weight/1000000} kg`

// const _formatTemp = (temp) => {
//   if (temp !== undefined && temp !== null) {
//     return `${parsing.toFloat(temp)} °C`
//   }

//   return 'Unknown'
// }

const _formatTimestamp = (sec) => {
  if (!sec) {
    sec = Date.now() / 1000
  }
  return moment.unix(sec).format('YYYY-MM-DD')
}

const _loadData = (recordId, state) => {
  let publicKey = api.getPublicKey()
  return records.fetchRecord(recordId)
    .then(record => {
      state.record = record
    })
    .then(() => {
      agents.getAgents()
        .then((agents) => {
          state.agents = agents.filter((agent) => agent.public_key !== publicKey)
          state.owner = agents.filter((agent) => agent.public_key === state.record.owner)[0]
          state.custodian = agents.filter((agent) => agent.public_key === state.record.custodian)[0]
        })
    })
    .then(() => {
      auth.getSigner()
        .then((signer) => {
          state.signer = signer
        })
    })
  // .then(record =>
  //   Promise.all([
  //     record,
  //     m.request({
  //       method: 'GET',
  //       url: '/grid/agent'
  //     })
  //     .then(agents => Promise.resolve(agents))
  //   ])
  // )
  // .then(([record, agents, owner, custodian]) => {
  //   state.record = record
  //   state.agents = agents.filter((agent) => agent.key !== publicKey)
  //   state.owner = agents.find((agent) => agent.key === record.owner)
  //   state.custodian = agents.find((agent) => agent.key === record.custodian)
  // })
}

const _submitProposal = (record, role, publicKey, signer) => {
  return records.createProposal(
    record.record_id,
    publicKey,
    role,
    authorizableProperties,
    "authorizing agent to modify weight and location",
    signer
  )
}

const _answerProposal = (record, publicKey, role, response) => {
  let answerPayload = payloads.answerProposal({
    recordId: record.recordId,
    receivingAgent: publicKey,
    role,
    response
  })

  return transactions.submit([answerPayload], true).then(() => {
    console.log('Successfully submitted answer')
  })
}

const _updateProperty = (record, value, signer) => {
  return Promise.resolve(records.updateProperties(
    record.record_id,
    [value],
    signer
  ))
}

const _finalizeRecord = (record, signer) => {
  return records.finalizeRecord(record.record_id, signer)
}

const _authorizeReporter = (record, reporterKey, properties) => {
  let authroizePayload = payloads.createProposal({
    recordId: record.recordId,
    receivingAgent: reporterKey,
    role: payloads.createProposal.enum.REPORTER,
    properties: properties
  })

  return transactions.submit([authroizePayload], true).then(() => {
    console.log('Successfully submitted proposal')
  })
}

// const _revokeAuthorization = (record, reporterKey, properties) => {
//   let revokePayload = payloads.revokeReporter({
//     recordId: record.recordId,
//     reporterId: reporterKey,
//     properties
//   })

//   return transactions.submit([revokePayload], true).then(() => {
//     console.log('Successfully revoked reporter')
//   })
// }

module.exports = AssetDetail
