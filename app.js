const express = require('express')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')
const path = require('path')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')


const dbPath = path.join(__dirname, './tasksTracker.db')

const app = express()
app.use(express.json())

let db = null

//Initializing DB and Server 

const initializeDBAndServer = async () => {
    try {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        })

        app.listen(3000, () => console.log("Server Running Successfully!"))
    } catch (e) {
        console.log(`DB Error: ${e.message}`)
        process.exit(1)
    }
}

initializeDBAndServer()

//Register A User API

app.post("/signup", async (request, response) => {
    const { name, email, password } = request.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectUserQuery = `SELECT * FROM user WHERE email = '${email}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
        const createUserQuery = `
        INSERT INTO 
          user (name, email, password, created_at) 
        VALUES 
          (
            "${name}",
            "${email}",
            "${hashedPassword}", 
            datetime()
          )`;
        const dbResponse = await db.run(createUserQuery);
        const newUserId = dbResponse.lastID;
        response.send(`Created new user with ${newUserId}`);
    } else {
        response.status = 400;
        response.send("User already exists");
    }
});

//Login API 

app.post('/login', async (request, response) => {
    const { email, password } = request.body

    const queryToCheckUser = `
      SELECT *
      FROM user
      WHERE email = '${email}';
    `
    const dbUser = await db.get(queryToCheckUser)
    if (dbUser === undefined) {
        response.status(400)
        response.send('Invalid user')
    } else {
        const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
        if (isPasswordMatched) {
            const payload = { email: email }
            const jwtToken = jwt.sign(payload, 'SECRET')
            const jwtTokenObj = {
                jwtToken: jwtToken,
            }
            response.send(jwtTokenObj)
        } else {
            response.status(400)
            response.send('Invalid password')
        }
    }
})

//Token Verification

const authenticateToken = (request, response, next) => {
    let jwtToken
    const authorization = request.headers['authorization']

    if (authorization !== undefined) {
        jwtToken = authorization.split(' ')[1]
    }
    if (jwtToken === undefined) {
        response.status(401)
        response.send('Invalid JWT Token')
    } else {
        jwt.verify(jwtToken, 'SECRET', async (error, payload) => {
            if (error) {
                response.status(401)
                response.send('Invalid JWT Token')
            } else {
                request.email = payload.email
                next()
            }
        })
    }
}

//POST A Task

app.post('/tasks/', authenticateToken, async (request, response) => {
    const { email } = request
    const { title, description, status, due_date } = request.body

    const queryToGetUserId = `
      SELECT id 
      FROM user 
      WHERE email = '${email}';
    `
    const userId = await db.get(queryToGetUserId)

    const queryToPostATask = `
      INSERT INTO tasks(title, description, status, due_date, user_id)
      VALUES ('${title}','${description}','${status}','${due_date}', ${userId.id});
    `
    await db.run(queryToPostATask)
    response.send('Task Successfully Added')
})

//CHECKING Is Task Belongs To User

const checkingIsTaskBelongsToUser = async (request, response, next) => {
    const { email } = request
    const { id } = request.params
    const queryToGetUserId = `
      SELECT id
      FROM user
      WHERE email = '${email}';
    `
    const user = await db.get(queryToGetUserId)
    const userId = user.id

    const queryToCheckIsTaskBelongsToUser = `
     SELECT *
     FROM user INNER JOIN tasks ON user.id = tasks.user_id
     
     WHERE user.id = ${userId} AND tasks.id= ${id};
    `
    const isTaskBelongsToUser = await db.get(
        queryToCheckIsTaskBelongsToUser
    )

    if (isTaskBelongsToUser === undefined) {
        response.status(401)
        response.send('Invalid Request')
    } else {
        next()
    }
}

//GET Tasks list using query parameters

app.get('/tasks/', authenticateToken, async (request, response) => {
    const { email } = request
    const queryToGetUserId = `
      SELECT id
      FROM user
      WHERE email = '${email}'
    `
    const user = await db.get(queryToGetUserId)

    const userId = user.id

    const { status = '', search_q = '' } = request.query
    let queryToGetTasksList
    switch (true) {
        case !status && !search_q:
            queryToGetTasksList = `
        SELECT *
        FROM tasks 
        WHERE user_id = ${userId};
      `
            break

        case !search_q:
            queryToGetTasksList = `
        SELECT *
        FROM tasks
        WHERE user_id = ${userId} AND status = '${status}';
      `
            break

        case !status:
            queryToGetTasksList = `
        SELECT *
        FROM tasks 
        WHERE user_id = ${userId} AND title LIKE '%${search_q}%';
      `
            break
        default:
            queryToGetTasksList = `
        SELECT *
        FROM tasks 
        WHERE user_id = ${userId};
      `
            break
    }

    const todosArray = await db.all(queryToGetTasksList)
    response.send(todosArray)
})

//PUT A TASK API 

app.put('/tasks/:id', authenticateToken, checkingIsTaskBelongsToUser, async (request, response) => {
    const { id } = request.params

    const { title, description, status, due_date } = request.body

    const queryToUpdateATask = `
      UPDATE tasks
      SET
        title ='${title}',
        description = '${description}',
        status ='${status}',
        due_date ='${due_date}'
      WHERE id = ${id};
    `
    await db.run(queryToUpdateATask)
    response.send("Task Updated Successfully")
})

//DELETE A Task API 

app.delete('/tasks/:id', authenticateToken, checkingIsTaskBelongsToUser, async (request, response) => {
    const { id } = request.params

    const queryToDeleteATask = `
      DELETE FROM
      tasks
      WHERE id = ${id};
    `

    await db.run(queryToDeleteATask)
    response.send("Task Deleted Successfully!")
})