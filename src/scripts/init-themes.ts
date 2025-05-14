// Initialization script for themes
// Populates the themes table with initial categories for WHOOP-related content

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Setup Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Define main themes
const mainThemes = [
  {
    name: 'Hardware & Device',
    description: 'Topics related to the physical WHOOP device, including build quality, comfort, and durability',
    priority: 1,
    subthemes: [
      { name: 'Battery Life', description: 'Battery performance and charging issues', priority: 1 },
      { name: 'Comfort & Wearability', description: 'How the device feels to wear, irritation issues', priority: 2 },
      { name: 'Design & Aesthetics', description: 'Appearance and style of the device and bands', priority: 3 },
      { name: 'Durability', description: 'Device longevity and resistance to damage', priority: 4 },
      { name: 'Sensor Performance', description: 'Accuracy and reliability of device sensors', priority: 5 },
    ]
  },
  {
    name: 'Software & App',
    description: 'Topics related to the WHOOP mobile app, user interface, and software functionality',
    priority: 2,
    subthemes: [
      { name: 'App Usability', description: 'User interface and ease of use', priority: 1 },
      { name: 'Feature Requests', description: 'Desired new software capabilities', priority: 2 },
      { name: 'Data Access', description: 'Ability to access and export personal data', priority: 3 },
      { name: 'Notifications', description: 'App notifications and alerts', priority: 4 },
      { name: 'App Stability', description: 'App crashes, bugs, and technical issues', priority: 5 },
    ]
  },
  {
    name: 'Metrics & Accuracy',
    description: 'Topics related to the accuracy and reliability of measurements and health metrics',
    priority: 3,
    subthemes: [
      { name: 'Sleep Tracking', description: 'Sleep detection, stages, and quality metrics', priority: 1 },
      { name: 'Heart Rate Monitoring', description: 'Accuracy of heart rate metrics', priority: 2 },
      { name: 'Strain Calculation', description: 'Accuracy and consistency of strain scores', priority: 3 },
      { name: 'Recovery Assessment', description: 'Recovery score accuracy and consistency', priority: 4 },
      { name: 'Workout Detection', description: 'Automatic activity and workout detection', priority: 5 },
      { name: 'Body Metrics', description: 'Body composition and other body measurements', priority: 6 },
    ]
  },
  {
    name: 'Pricing & Membership',
    description: 'Topics related to cost, subscription models, membership tiers, and value proposition',
    priority: 4,
    subthemes: [
      { name: 'Membership Value', description: 'Is WHOOP worth the cost?', priority: 1 },
      { name: 'Pricing Model', description: 'Subscription vs. one-time purchase debates', priority: 2 },
      { name: 'Price Increases', description: 'Reactions to changes in pricing', priority: 3 },
      { name: 'Cancellation', description: 'Experiences with cancelling membership', priority: 4 },
    ]
  },
  {
    name: 'Competitive Comparison',
    description: 'Topics comparing WHOOP to competing fitness wearables and services',
    priority: 5,
    subthemes: [
      { name: 'Apple Watch vs. WHOOP', description: 'Comparisons to Apple Watch', priority: 1 },
      { name: 'Oura Ring vs. WHOOP', description: 'Comparisons to Oura Ring', priority: 2 },
      { name: 'Garmin vs. WHOOP', description: 'Comparisons to Garmin devices', priority: 3 },
      { name: 'Fitbit vs. WHOOP', description: 'Comparisons to Fitbit devices', priority: 4 },
      { name: 'Value Comparison', description: 'Value proposition compared to competitors', priority: 5 },
    ]
  },
  {
    name: 'Customer Support',
    description: 'Topics related to customer service, warranty issues, and support experiences',
    priority: 6,
    subthemes: [
      { name: 'Support Responsiveness', description: 'Response time and quality of support', priority: 1 },
      { name: 'Warranty Claims', description: 'Experiences with warranty process', priority: 2 },
      { name: 'Return Process', description: 'Experiences with returns and refunds', priority: 3 },
    ]
  },
  {
    name: 'Product Updates',
    description: 'Topics related to new hardware releases and software updates',
    priority: 7,
    subthemes: [
      { name: 'WHOOP 5.0 Discussion', description: 'Specific discussions about the newest WHOOP 5.0', priority: 1 },
      { name: 'Feature Updates', description: 'Reactions to new software features', priority: 2 },
      { name: 'Update Issues', description: 'Problems after updates', priority: 3 },
    ]
  },
  {
    name: 'Community & Social',
    description: 'Topics related to the WHOOP community, teams, and social features',
    priority: 8,
    subthemes: [
      { name: 'Community Features', description: 'WHOOP teams and social capabilities', priority: 1 },
      { name: 'Data Sharing', description: 'Sharing and comparing data with others', priority: 2 },
      { name: 'Coaching', description: 'Coaching and training related to WHOOP data', priority: 3 },
    ]
  },
];

// Function to insert themes into the database
async function insertThemes() {
  console.log('Initializing themes in database...');
  
  // Insert main themes first
  for (const theme of mainThemes) {
    const { subthemes, ...mainThemeData } = theme;
    
    // Add timestamps
    const themeWithTimestamps = {
      ...mainThemeData,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    // Insert main theme
    const { data: mainThemeResult, error: mainThemeError } = await supabase
      .from('themes')
      .upsert(themeWithTimestamps, {
        onConflict: 'name',
        ignoreDuplicates: false,
      })
      .select();
    
    if (mainThemeError) {
      console.error(`Error inserting main theme ${mainThemeData.name}:`, mainThemeError);
      continue;
    }
    
    if (!mainThemeResult || mainThemeResult.length === 0) {
      console.error(`Failed to insert main theme ${mainThemeData.name}`);
      continue;
    }
    
    const mainThemeId = mainThemeResult[0].id;
    console.log(`Inserted main theme: ${mainThemeData.name}`);
    
    // Insert subthemes
    if (subthemes && subthemes.length > 0) {
      const subthemesWithParent = subthemes.map(subtheme => ({
        ...subtheme,
        parent_theme_id: mainThemeId,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      
      const { error: subthemesError } = await supabase
        .from('themes')
        .upsert(subthemesWithParent, {
          onConflict: 'name',
          ignoreDuplicates: false,
        });
      
      if (subthemesError) {
        console.error(`Error inserting subthemes for ${mainThemeData.name}:`, subthemesError);
      } else {
        console.log(`Inserted ${subthemes.length} subthemes for ${mainThemeData.name}`);
      }
    }
  }
  
  console.log('Theme initialization complete');
}

// Run the initialization function
insertThemes().catch(error => console.error('Error in theme initialization:', error)); 