// This entry point is only loaded by the isolated test harness, never production.
import app from '../../src/index.js'
import { fixtureResponse } from './image-fixtures.js'

globalThis.fetch = async (input, options = {}) => {
  // Match Workers fetch, which does not implement redirect: 'error'.
  if (options.redirect && !['follow', 'manual'].includes(options.redirect)) throw new TypeError('Unsupported redirect mode')
  return fixtureResponse(typeof input === 'string' ? input : input.url || input.href)
}
export default app
