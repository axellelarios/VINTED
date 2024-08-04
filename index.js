//-- Express
// Je créé mon serveur

const express = require("express");
const app = express();

//le module cors permet d'autoriser ou non les demandes provenant de l'extérieur.
const cors = require("cors")
app.use(cors());

// Utilisation des parametre body 
app.use(express.json())

// Package obligatoir epour pouvoir utiliser les body "form-data"
const fileUpload = require("express-fileupload") 

// Variables DOTENV
// Permet d'activer les variables d'environnement qui se trouvent dans le fichier `.env`  
require('dotenv').config();

//-- Mongoose
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGODB_URI);
 
//-- Encryptage mot de passe
const SHA256 = require("crypto-js/sha256");
const encBase64 = require("crypto-js/enc-base64");  
const uid2 = require("uid2"); 


//-- Import package cloudinary
const cloudinary = require("cloudinary");  
          
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const convertToBase64 = (file) => {
    return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};

// Creation de mon model User
//*soon* Import des models

const User = mongoose.model("User", {
        email: String,
        account: {
          username: String,
          avatar: Object, 
        },
        newsletter: Boolean,
        token: String,
        hash: String,
        salt: String, 
})

const Offer = mongoose.model("Offer", {
    product_name: String,
    product_description: String,
    product_price: Number,
    product_details: Array,
    product_image: Object,
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  });

/// MIDDLEWARE IsAuthenticated
const isAuthenticated = async (req, res, next) => {
    if (req.headers.authorization) {
      const user = await User.findOne({
        token: req.headers.authorization.replace("Bearer ", "")
      });
  
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      } else {
        req.user = user; 
        // On crée une clé "user" dans req. La route dans laquelle le middleware est appelé     pourra avoir accès à req.user
        return next();
      } 
    } else {
      return res.status(401).json({ error: "Unauthorized" });
    }
};

/// ROUTES


app.get("/", (req, res) => {
  res.json({message: "It's live bitches!!"});  
})

app.get("/offers", async (req, res) => {
   try {

    // On crée un filtre vide
    let filters = {}

    // si on reçoit un titre
    if (req.query.title){
       // On rajoute une clef product_name contenant une RegExp créée à partir du query title
       filters.product_name = new RegExp(req.query.title, "i");
    }

    // si on reçois un priceMin
    if (req.query.priceMin){
       filters.product_price = { $gte: req.query.priceMin }
    }

    // si on reçois un priceMax
    if (req.query.priceMax) {
        if(filters.product_price) {
          filters.product_price.$lte = req.query.priceMax
        } else (
          filters.product_price = { $lte: req.query.priceMax }
        )
    }

    // Création d'un objet sort qui servira à gérer le tri
    let sort = {}

    if(req.query.sort === "price-desc"){
       sort = { product_price: "desc"}
    } else if (req.query.sort === "price-asc") {
       sort = { product_price: "asc"}
    }
    
    // Creation variable page
    let page;
    // Si le query page n'est pas un nombre >= à 1
    if (Number(req.query.page) < 1) {
      // page sera par défaut à 1
      page = 1;
    } else {
      // Sinon page sera égal au query reçu
      page = Number(req.query.page);
    }

     const limit = 10

     const offers = await Offer.find(filters)
      .populate({
        path: "owner",
        select: "account",
      })   
      .limit(limit)
      .sort(sort)
      .skip((page - 1) * limit)
      .select("product_image product_name product_description product_details product_price -_id");

      // count = retourne nombre d'annonce
      const count = await Offer.countDocuments(filters);
      res.json({
        count: count,
        offers: offers,
      });

   } catch (error) {
     res.status(500).json({ message:error.message}) 
   }
})

// POST :USER
app.post("/user/signup", fileUpload(),  async (req, res) => {
    try {    
        //Création de l'encryptage en fonction du mot de passe de l'utilisateur
        const password = req.body.password;
        const salt = uid2(30);
        const hash = SHA256(password + salt).toString(encBase64);
        const token = uid2(30);

        const { email, username, newsletter } = req.body;

        let newUser = new User({
            email: email,
            account: {
              username : username
            },
            newsletter: newsletter,
            token: token ,
            hash: hash,
            salt: salt,           
        }) 

        if (req.files === null || req.files.avatar.length === 0) {
          res.send("No file uploaded!");
          return;
        }

        const avatarUrl = [];
        const picturesToUpload = req.files.avatar;

        for (let i = 0; i < picturesToUpload.length; i++) {
           const picture = picturesToUpload[i];
           const result = await cloudinary.uploader.upload(convertToBase64(picture), {
            folder: `/vinted/user/${newUser._id}`,
            public_id: "olympic_flag"
           });
           avatarUrl.push(result.secure_url);
        }

        newUser = new User({
          email: email,
          account: {
            username : username,
            avatar: avatarUrl
          },
          newsletter: newsletter,
          token: token ,
          hash: hash,
          salt: salt,        
        })

        await newUser.save()
        res.json(newUser); 

    } catch (error) {
        res.json({message: error.message });
    }  
})


// Routes pour poster une annonce
app.post("/offer/publish", isAuthenticated, fileUpload(), async (req, res) => {
    try { 

        // Conversion des photos que j'envoie via postman sous la clé picture
         const { title, description, price, condition, city, brand, size, color } = req.body;
         let newOffer = new Offer({
            product_name: title,
            product_description: description,
            product_price: price,
            product_details: [condition, city, brand, size, color], 
          }); 

          if (req.files === null || req.files.picture.length === 0) {
            res.send("No file uploaded!");
            return;
          }

          const arrayOfFilesUrl = [];
          const picturesToUpload = req.files.picture;

          for (let i = 0; i < picturesToUpload.length; i++) {
             const picture = picturesToUpload[i];
             const result = await cloudinary.uploader.upload(convertToBase64(picture), {
              folder: `/vinted/offers/${newOffer._id}`,
              public_id: "olympic_flag" 
             });
             arrayOfFilesUrl.push(result.secure_url);
          }

          newOffer = new Offer({
            product_name: title,
            product_description: description,
            product_price: price,
            product_image: arrayOfFilesUrl,
            product_details: [condition, city, brand, size, color],
            owner: req.user
          }); 
          
          await newOffer.save() 
          res.json(newOffer);  

    } catch (error) {
        res.json({message: error.message });  
    }  
}) 



// Je récupère toutes les routes, même celles qui ne fonctionne pas
app.all("*", (req, res) => {
    res.json({message: "Page not found"}); 
})

// Je lance mon serveur
app.listen(process.env.PORT, () => {
    console.log("Servor is live 😊😊😊") 
}) 