import express from "express"
import multer from "multer"
import os from "os"
import fs from "fs"
import dotenv from "dotenv"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import Replicate from "replicate"
import PQueue from "p-queue"
import cors from "cors"

dotenv.config()

const app = express()

app.use(express.json())

app.use(cors({
 origin: "*"
}))

/* =====================
DATABASE
===================== */

mongoose.connect(process.env.MONGODB_URI)

const Usuario = mongoose.model("Usuario", new mongoose.Schema({
 email:String,
 senha:String,
 creditos:{type:Number,default:5}
}))

const Geracao = mongoose.model("Geracao", new mongoose.Schema({
 usuario:mongoose.Schema.Types.ObjectId,
 imagem:String,
 resultado:String,
 prompt:String,
 data:{type:Date,default:Date.now}
}))

/* =====================
REPLICATE
===================== */

const replicate = new Replicate({
 auth:process.env.REPLICATE_API_TOKEN
})

/* =====================
QUEUE
===================== */

const queue = new PQueue({
 concurrency:1
})

/* =====================
UPLOAD
===================== */

const upload = multer({
 dest: os.tmpdir()
})

/* =====================
AUTH
===================== */

function auth(req,res,next){

 const header = req.headers.authorization

 if(!header)
  return res.status(401).json({erro:"token ausente"})

 const token = header.split(" ")[1]

 try{

  const decoded = jwt.verify(
   token,
   process.env.JWT_SECRET
  )

  req.userId = decoded.id

  next()

 }catch{

  return res.status(401).json({
   erro:"token inválido"
  })

 }

}

/* =====================
REGISTER
===================== */

app.post("/api/register", async(req,res)=>{

 try{

  const {email,senha} = req.body

  const hash = await bcrypt.hash(senha,10)

  const user = await Usuario.create({
   email,
   senha:hash
  })

  res.json({
   success:true
  })

 }catch{

  res.status(500).json({
   success:false
  })

 }

})

/* =====================
LOGIN
===================== */

app.post("/api/login", async(req,res)=>{

 const {email,senha} = req.body

 const user = await Usuario.findOne({email})

 if(!user)
  return res.status(401).json({
   success:false
  })

 const ok = await bcrypt.compare(senha,user.senha)

 if(!ok)
  return res.status(401).json({
   success:false
  })

 const token = jwt.sign(
  {id:user._id},
  process.env.JWT_SECRET,
  {expiresIn:"7d"}
 )

 res.json({
  success:true,
  token,
  creditos:user.creditos
 })

})

/* =====================
TRANSFORM
===================== */

app.post(
 "/api/transform",
 auth,
 upload.single("image"),
 async(req,res)=>{

 try{

  const user = await Usuario.findOneAndUpdate(
   {_id:req.userId,creditos:{$gte:1}},
   {$inc:{creditos:-1}},
   {new:true}
  )

  if(!user)
   return res.status(402).json({
    success:false,
    erro:"sem créditos"
   })

  const file = req.file

  if(!file)
   return res.status(400).json({
    success:false
   })

  const prompt = req.body.prompt || "realistic portrait"

  const resultado = await queue.add(async()=>{

   const output = await replicate.run(
    "black-forest-labs/flux-dev",
    {
     input:{
      prompt
     }
    }
   )

   return output

  })

  await Geracao.create({
   usuario:req.userId,
   imagem:file.path,
   resultado:resultado[0],
   prompt
  })

  await fs.promises.unlink(file.path)

  res.json({
   success:true,
   imageUrl:resultado[0],
   creditos:user.creditos
  })

 }catch(e){

  console.error(e)

  res.status(500).json({
   success:false
  })

 }

})

/* =====================
HISTORY
===================== */

app.get(
 "/api/history",
 auth,
 async(req,res)=>{

 const dados = await Geracao.find({
  usuario:req.userId
 }).sort({data:-1})

 res.json(dados)

})

/* =====================
HEALTH
===================== */

app.get("/",(req,res)=>{
 res.send("API ONLINE")
})

/* =====================
START
===================== */

const PORT = process.env.PORT || 8000

app.listen(PORT,()=>{
 console.log("server rodando")
})