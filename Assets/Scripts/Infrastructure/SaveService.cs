using UnityEngine;

namespace BlockPlus.Infrastructure
{
    public static class SaveService
    {
        private const string BestScoreKey = "blockplus.best_score";
        private const string SoundEnabledKey = "blockplus.sound_enabled";
        private const string MusicEnabledKey = "blockplus.music_enabled";
        private const string LifetimeGamesKey = "blockplus.lifetime_games";

        public static int LoadBestScore()
        {
            return PlayerPrefs.GetInt(BestScoreKey, 0);
        }

        public static void SaveBestScore(int score)
        {
            if (score <= LoadBestScore())
            {
                return;
            }

            PlayerPrefs.SetInt(BestScoreKey, score);
            PlayerPrefs.Save();
        }

        public static bool LoadSoundEnabled()
        {
            return PlayerPrefs.GetInt(SoundEnabledKey, 1) == 1;
        }

        public static void SaveSoundEnabled(bool enabled)
        {
            PlayerPrefs.SetInt(SoundEnabledKey, enabled ? 1 : 0);
            PlayerPrefs.Save();
        }

        public static bool LoadMusicEnabled()
        {
            return PlayerPrefs.GetInt(MusicEnabledKey, 1) == 1;
        }

        public static void SaveMusicEnabled(bool enabled)
        {
            PlayerPrefs.SetInt(MusicEnabledKey, enabled ? 1 : 0);
            PlayerPrefs.Save();
        }

        public static int LoadLifetimeGames()
        {
            return PlayerPrefs.GetInt(LifetimeGamesKey, 0);
        }

        public static int IncrementLifetimeGames()
        {
            int value = LoadLifetimeGames() + 1;
            PlayerPrefs.SetInt(LifetimeGamesKey, value);
            PlayerPrefs.Save();
            return value;
        }
    }
}
