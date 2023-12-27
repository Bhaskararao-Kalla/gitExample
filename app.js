const express = require("express");
const app = express();
module.exports = app;
app.use(express.json());

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
console.log(dbPath);

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

//initializeDBAndServer
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("server running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`DB Error ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//POST "/register/"
app.post("/register/", async (request, response) => {
  const { username, password, gender, name } = request.body;

  const userQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}';
    `;

  const user = await db.get(userQuery);

  if (user !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    // console.log(name, username, hashedPassword, gender);
    const createUserQuery = `
      INSERT INTO 
        user (username, password, name, gender) 
      VALUES 
        (
          '${username}', 
          '${hashedPassword}', 
          '${name}',
          '${gender}'
        )`;

    await db.run(createUserQuery);
    response.send("User created successfully");
  }
});

//POST '/login/'
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const userQuery = `
        SELECT * 
        FROM user 
        WHERE username = '${username}';
    `;

  const userDetails = await db.get(userQuery);
  //   console.log(userDetails);
  //   console.log(password);
  //   console.log(username);

  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatchedPassword = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isMatchedPassword === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username };
      // console.log(payload);
      const jwtToken = await jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    }
  }
});

//authenticatingToken
const authenticatingToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  //   console.log(authHeader);

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  //   console.log(jwtToken);

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// GET api /user/tweets/feed/
app.get(
  "/user/tweets/feed/",
  authenticatingToken,
  async (request, response) => {
    const { username } = request;
    // console.log(username);

    const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

    const { userId } = await db.get(userDetailsQuery);
    // console.log(userId);

    const tweetsQuery = `
        SELECT 
           user.username ,
           tweet.tweet,
           tweet.date_time as dateTime
        FROM 
            tweet JOIN user ON tweet.user_id = user.user_id  
        WHERE 
            user.user_id IN (
                SELECT 
                    following_user_id 
                FROM follower 
                WHERE follower_user_id = '${userId}'
                
            ) 
        ORDER BY tweet.date_time DESC
        LIMIT 4;
    `;
    const tweetsResult = await db.all(tweetsQuery);
    response.send(tweetsResult);
  }
);

//GET api /user/following/
app.get("/user/following/", authenticatingToken, async (request, response) => {
  const { username } = request;

  const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

  const { userId } = await db.get(userDetailsQuery);
  const userFollowingQuery = `
        SELECT 
            user.name as name
        FROM user 
        WHERE user_id IN (
            SELECT 
                follower.following_user_id
            FROM user JOIN follower on user.user_id = follower.follower_user_id 
            WHERE user.user_id = '${userId}'
        );
  `;
  const followingUserData = await db.all(userFollowingQuery);
  response.send(followingUserData);
});

// GET api '/user/followers/'
app.get("/user/followers/", authenticatingToken, async (request, response) => {
  const { username } = request;

  const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

  const { userId } = await db.get(userDetailsQuery);
  const followersUsersQuery = `
        SELECT 
            user.name as name
        FROM user 
        WHERE user_id IN (
            SELECT 
                follower.follower_user_id
            FROM user JOIN follower on user.user_id = follower.follower_user_id 
            WHERE follower.following_user_id = '${userId}'
        );
  `;
  const followersUserData = await db.all(followersUsersQuery);
  response.send(followersUserData);
});

//GET api "/tweets/:tweetId/"
app.get("/tweets/:tweetId/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

  const { userId } = await db.get(userDetailsQuery);

  const tweetDetailsQuery = `
        SELECT user_id as tweetedUserId
        FROM tweet 
        WHERE tweet_id = '${tweetId}'
    `;
  const { tweetedUserId } = await db.get(tweetDetailsQuery);

  const checkFollowerQuery = `
        SELECT * 
        FROM follower 
        WHERE follower_user_id = '${userId}' AND 
               following_user_id = '${tweetedUserId}'
    `;
  const tweetedUserFollowTheUser = await db.get(checkFollowerQuery);
  console.log(tweetedUserFollowTheUser);

  if (tweetedUserFollowTheUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const likesAndRepliesCountQuery = `
            SELECT 
                tweet.tweet as tweet ,
                count() as likes ,
                (SELECT count()
                 FROM tweet JOIN reply on tweet.tweet_id = reply.tweet_id 
                 WHERE tweet.tweet_id = '${tweetId}'
                ) as replies ,
                tweet.date_time as dateTime

            FROM tweet JOIN like on tweet.tweet_id = like.tweet_id 
            WHERE tweet.tweet_id = '${tweetId}';
        `;

    const tweetDetails = await db.get(likesAndRepliesCountQuery);
    response.send(tweetDetails);
  }
});

//GET api "/tweets/:tweetId/likes/"
app.get(
  "/tweets/:tweetId/likes/",
  authenticatingToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

    const { userId } = await db.get(userDetailsQuery);

    const tweetDetailsQuery = `
        SELECT user_id as tweetedUserId
        FROM tweet 
        WHERE tweet_id = '${tweetId}'
    `;
    const { tweetedUserId } = await db.get(tweetDetailsQuery);

    const checkFollowerQuery = `
        SELECT * 
        FROM follower 
        WHERE follower_user_id = '${userId}' AND 
               following_user_id = '${tweetedUserId}'
    `;
    const tweetedUserFollowTheUser = await db.get(checkFollowerQuery);
    console.log(tweetedUserFollowTheUser);

    if (tweetedUserFollowTheUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likedUsersQuery = `
        SELECT 
            user.name AS name 
        FROM like JOIN user ON like.user_id = user.user_id 
        WHERE like.tweet_id = '${tweetId}'
      `;

      const usersLikedDetails = await db.all(likedUsersQuery);
      const likedUsersArray = usersLikedDetails.map((each) => each.name);
      //console.log(likedUsersArray);

      const likedUsers = { likes: likedUsersArray };
      response.send(likedUsers);
    }
  }
);

//GET api "/tweets/:tweetId/replies"
app.get(
  "/tweets/:tweetId/replies/",
  authenticatingToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

    const { userId } = await db.get(userDetailsQuery);

    const tweetDetailsQuery = `
        SELECT user_id as tweetedUserId
        FROM tweet 
        WHERE tweet_id = '${tweetId}'
    `;
    const { tweetedUserId } = await db.get(tweetDetailsQuery);

    const checkFollowerQuery = `
        SELECT * 
        FROM follower 
        WHERE follower_user_id = '${userId}' AND 
               following_user_id = '${tweetedUserId}'
    `;
    const tweetedUserFollowTheUser = await db.get(checkFollowerQuery);
    console.log(tweetedUserFollowTheUser);

    if (tweetedUserFollowTheUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const userReplyQuery = `
        SELECT 
            user.name AS name ,
            reply.reply AS reply
        FROM reply JOIN user ON reply.user_id = user.user_id 
        WHERE reply.tweet_id = '${tweetId}'
      `;

      const userReplyDetails = await db.all(userReplyQuery);

      const userReplyArray = { replies: userReplyDetails };
      response.send(userReplyArray);
    }
  }
);

//GET api "/user/tweets/"
app.get("/user/tweets/", authenticatingToken, async (request, response) => {
  const { username } = request;

  const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

  const { userId } = await db.get(userDetailsQuery);

  const userTweetsQuery = `
        SELECT 
            tweet_like.tweet,
            count(distinct tweet_like.like_id) as likes,
            count(distinct reply.reply_id) as replies,
            tweet_like.date_time as dateTime
        FROM (tweet JOIN like on tweet.tweet_id = like.tweet_id ) as tweet_like 
        JOIN reply ON reply.tweet_id = tweet_like.tweet_id
        WHERE tweet.user_id = '${userId}';
        GROUP BY tweet.tweet_id
        
    `;

  const userTweets = await db.all(userTweetsQuery);
  response.send(userTweets);
});

//POST "/user/tweets/"
app.post("/user/tweets/", authenticatingToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;

  const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

  const { userId } = await db.get(userDetailsQuery);

  const createTweetQuery = `
        INSERT INTO 
            tweet (user_id , tweet) 
        VALUES 
            ('${userId}' , '${tweet}'); 
  `;
  const tweetInfo = await db.run(createTweetQuery);
  //   console.log(tweetInfo.lastID);
  response.send("Created a Tweet");
});

//DELETE "/tweets/:tweetId/"
app.delete(
  "/tweets/:tweetId/",
  authenticatingToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;

    const userDetailsQuery = `
        SELECT user_id as userId
        FROM user 
        WHERE username = '${username}';
    `;

    const { userId } = await db.get(userDetailsQuery);

    const tweetDetailsQuery = `
        SELECT * 
        FROM tweet
        WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';
    `;

    const tweetDetails = await db.get(tweetDetailsQuery);

    if (tweetDetails === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE FROM tweet 
        WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';
    `;

      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);
