#!/usr/bin/env node
import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const password = process.env.ADMIN_PASSWORD || process.argv[2]

if (!password || password.length < 8) {
  console.error('Usage: ADMIN_PASSWORD="mot-de-passe" node scripts/hash-admin-password.mjs')
  console.error('Le mot de passe doit contenir au moins 8 caractères.')
  process.exit(1)
}

const salt = randomBytes(16)
const derived = await scrypt(password, salt, 64)
console.log(`${salt.toString('base64')}:${Buffer.from(derived).toString('base64')}`)
