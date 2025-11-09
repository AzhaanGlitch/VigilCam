const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

module.exports = function(passport) {
  // Local Strategy
  passport.use(
    new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
      try {
        // Match user
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
          return done(null, false, { message: 'Email not registered' });
        }

        // Check if user registered with Google
        if (user.googleId && !user.password) {
          return done(null, false, { message: 'Please sign in with Google' });
        }

        // Match password
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (isMatch) {
          return done(null, user);
        } else {
          return done(null, false, { message: 'Incorrect password' });
        }
      } catch (err) {
        return done(err);
      }
    })
  );

  // Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.NODE_ENV === 'production' 
          ? 'https://vigilcam.onrender.com/users/auth/google/callback'
          : '/users/auth/google/callback',
        proxy: true
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          let user = await User.findOne({ googleId: profile.id });

          if (user) {
            // User exists, return user
            return done(null, user);
          }

          // Check if email already exists (user might have registered traditionally)
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          
          if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
            
            if (user) {
              // Link Google account to existing user
              user.googleId = profile.id;
              user.picture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
              await user.save();
              return done(null, user);
            }
          }

          // Create new user
          const newUser = new User({
            googleId: profile.id,
            name: profile.displayName,
            email: email ? email.toLowerCase() : `${profile.id}@google.oauth`,
            picture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
            role: 'user'
          });

          await newUser.save();
          return done(null, newUser);
        } catch (err) {
          console.error('Google OAuth Error:', err);
          return done(err, null);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};