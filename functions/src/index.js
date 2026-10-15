import { Hono } from 'hono'
import emotes from './routes/emotes.js'
import usecode from './routes/usecode.js'
import auth from './routes/auth.js'
import users from './routes/users.js'
import { secureHeaders } from 'hono/secure-headers'

const app = new Hono()
app.use('*', secureHeaders())

app.get('/', (c) => c.json({ message: 'Hello World' }))
app.get('/api/health', (c) => c.json({ status: 'ok' }))
app.route('/api/emotes', emotes)
app.route('/api/usecode', usecode)
app.route('/api/auth', auth)
app.route('/api/users', users)

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Erro interno da API' }, 500)
})

app.notFound((c) => c.json({ error: 'Rota não encontrada' }, 404))

export default app
