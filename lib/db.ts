import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  created_at: Date
  updated_at: Date
}

export interface Chat {
  id: string
  user_id: string
  title: string
  created_at: Date
  updated_at: Date
  path: string
}

export interface Message {
  id: string
  chat_id: string
  role: "user" | "assistant" | "system"
  content: string
  tool_invocations?: any
  created_at: Date
}

export interface CanvasDocument {
  id: string
  chat_id: string
  title: string
  content: string
  type: string
  created_at: Date
  updated_at: Date
}

export interface Vote {
  chat_id: string
  message_id: string
  is_upvoted: boolean
}

// User operations
export async function getUser(email: string): Promise<User | null> {
  try {
    const result = await sql`
      SELECT * FROM users WHERE email = ${email}
    `
    return (result[0] as User) || null
  } catch (error) {
    console.error("Error getting user:", error)
    return null
  }
}

export async function createUser(email: string, name: string, image?: string): Promise<User> {
  const result = await sql`
    INSERT INTO users (email, name, image)
    VALUES (${email}, ${name}, ${image || null})
    RETURNING *
  `
  return result[0] as User
}

// Chat operations
export async function getChats(userId: string): Promise<Chat[]> {
  try {
    const result = await sql`
      SELECT * FROM chats 
      WHERE user_id = ${userId} 
      ORDER BY updated_at DESC
    `
    return result as Chat[]
  } catch (error) {
    console.error("Error getting chats:", error)
    return []
  }
}

export async function getChat(id: string, userId: string): Promise<Chat | null> {
  try {
    const result = await sql`
      SELECT * FROM chats 
      WHERE id = ${id} AND user_id = ${userId}
    `
    return (result[0] as Chat) || null
  } catch (error) {
    console.error("Error getting chat:", error)
    return null
  }
}

export async function createChat(userId: string, title: string, path: string): Promise<Chat> {
  const result = await sql`
    INSERT INTO chats (user_id, title, path)
    VALUES (${userId}, ${title}, ${path})
    RETURNING *
  `
  return result[0] as Chat
}

export async function updateChat(id: string, title: string): Promise<void> {
  await sql`
    UPDATE chats 
    SET title = ${title}, updated_at = NOW()
    WHERE id = ${id}
  `
}

export async function deleteChat(id: string, userId: string): Promise<void> {
  await sql`
    DELETE FROM chats 
    WHERE id = ${id} AND user_id = ${userId}
  `
}

// Message operations
export async function getMessages(chatId: string): Promise<Message[]> {
  try {
    const result = await sql`
      SELECT * FROM messages 
      WHERE chat_id = ${chatId} 
      ORDER BY created_at ASC
    `
    return result as Message[]
  } catch (error) {
    console.error("Error getting messages:", error)
    return []
  }
}

export async function saveMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  toolInvocations?: any,
): Promise<Message> {
  const result = await sql`
    INSERT INTO messages (chat_id, role, content, tool_invocations)
    VALUES (${chatId}, ${role}, ${content}, ${toolInvocations ? JSON.stringify(toolInvocations) : null})
    RETURNING *
  `
  return result[0] as Message
}

// Canvas document operations
export async function getCanvasDocuments(chatId: string): Promise<CanvasDocument[]> {
  try {
    const result = await sql`
      SELECT * FROM canvas_documents 
      WHERE chat_id = ${chatId} 
      ORDER BY created_at DESC
    `
    return result as CanvasDocument[]
  } catch (error) {
    console.error("Error getting canvas documents:", error)
    return []
  }
}

export async function createCanvasDocument(
  chatId: string,
  title: string,
  content: string,
  type = "document",
): Promise<CanvasDocument> {
  const result = await sql`
    INSERT INTO canvas_documents (chat_id, title, content, type)
    VALUES (${chatId}, ${title}, ${content}, ${type})
    RETURNING *
  `
  return result[0] as CanvasDocument
}

export async function updateCanvasDocument(id: string, title: string, content: string): Promise<void> {
  await sql`
    UPDATE canvas_documents 
    SET title = ${title}, content = ${content}, updated_at = NOW()
    WHERE id = ${id}
  `
}

export async function deleteCanvasDocument(id: string): Promise<void> {
  await sql`
    DELETE FROM canvas_documents WHERE id = ${id}
  `
}

// Vote operations
export async function getVote(chatId: string, messageId: string): Promise<Vote | null> {
  try {
    const result = await sql`
      SELECT * FROM votes 
      WHERE chat_id = ${chatId} AND message_id = ${messageId}
    `
    return (result[0] as Vote) || null
  } catch (error) {
    console.error("Error getting vote:", error)
    return null
  }
}

export async function saveVote(chatId: string, messageId: string, isUpvoted: boolean): Promise<void> {
  await sql`
    INSERT INTO votes (chat_id, message_id, is_upvoted)
    VALUES (${chatId}, ${messageId}, ${isUpvoted})
    ON CONFLICT (chat_id, message_id)
    DO UPDATE SET is_upvoted = ${isUpvoted}
  `
}

export { sql }
