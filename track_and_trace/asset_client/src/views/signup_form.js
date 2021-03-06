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
const _ = require('lodash')

const forms = require('../components/forms')
const api = require('../services/api')
const transactions = require('../services/transactions')
const payloads = require('../services/payloads')
const PIKE_FAMILY_NAME = 'pike'

const { inputField } = require('../components/forms')
const authService = require('../services/auth')
const agentService = require('../services/agents')

const AgentSignUp = {
  submitting: false,
  error: null,

  username: '',
  password: '',
  passwordConfirm: '',
  name: '',

  setUsername: (value) => {
    AgentSignUp.username = value
  },

  setPassword: (value) => {
    AgentSignUp.password = value
  },

  setPasswordConfirm: (value) => {
    AgentSignUp.passwordConfirm = value
  },

  setName: (value) => {
    AgentSignUp.name = value
  },

  setOrganization: (value) => {
    AgentSignUp.organization = (value === '' ? '00000000000000000' : value)
  },

  submit: () => {
    AgentSignUp.submitting = true,
    authService.createUser(AgentSignUp, (signer) => agentService.createAgent(AgentSignUp.name, AgentSignUp.organization, signer))
      .then(() => {
        AgentSignUp.clear()
        m.route.set('/')
      })
      .catch((e) => {
        console.error(e)
        AgentSignUp.submitting = false
        AgentSignUp.error = e
      })
  },

  clear: () => {
    AgentSignUp.submitting = false,
    AgentSignUp.error = null

    AgentSignUp.username = ''
    AgentSignUp.password = ''
    AgentSignUp.passwordConfirm = ''
    AgentSignUp.name = ''
    AgentSignUp.organization = ''
  },

  invalid: () => {
    if (!AgentSignUp.username ||
        AgentSignUp.password !== AgentSignUp.passwordConfirm ||
        !AgentSignUp.name) {
          return true
    }

    return false
  }
}

/**
 * Agent Sign Up Form
 */
const AgentSignupForm = {
  oninit() {
    AgentSignUp.clear()
  },
  view() {
    return [
      m('.signup-form'),
        m('form', [
            AgentSignUp.error ? m('p.text-danger', AgentSignUp.error) : null,
            m('legend', 'Create Agent'),
            inputField('username', 'Email', AgentSignUp.username, AgentSignUp.setUsername),
            inputField('password', 'Password', AgentSignUp.password, AgentSignUp.setPassword, 'password'),
            inputField('passwordConfirm', 'Confirm Password', AgentSignUp.passwordConfirm, AgentSignUp.setPasswordConfirm, 'password'),
            inputField('name', 'Name', AgentSignUp.name, AgentSignUp.setName),
            inputField('organization', 'Organization', AgentSignUp.organization, AgentSignUp.setOrganization),

            m('.container.text-center',
              m('a[href="/login"]',
                { oncreate: m.route.link },
                'login an existing Agent')),
            m('.form-group',
              m('.row.justify-content-end.align-items-end',
                m('col-2',
                  m('button.btn.btn-primary',
                    {
                      onclick: AgentSignUp.submit,
                      disabled: AgentSignUp.submitting || AgentSignUp.invalid(),
                    }, 'Create Agent'))))
        ])
    ]
  }
}

module.exports = AgentSignupForm
