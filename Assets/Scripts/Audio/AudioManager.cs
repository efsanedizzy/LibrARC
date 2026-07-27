using BlockPlus.Infrastructure;
using UnityEngine;

namespace BlockPlus.Audio
{
    public sealed class AudioManager : MonoBehaviour
    {
        [Header("Sources")]
        [SerializeField] private AudioSource musicSource;
        [SerializeField] private AudioSource sfxSource;

        [Header("Clips")]
        [SerializeField] private AudioClip backgroundMusic;
        [SerializeField] private AudioClip placeClip;
        [SerializeField] private AudioClip clearClip;
        [SerializeField] private AudioClip comboClip;
        [SerializeField] private AudioClip buttonClip;

        public static AudioManager Instance { get; private set; }

        public bool SoundEnabled { get; private set; }
        public bool MusicEnabled { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
            SoundEnabled = SaveService.LoadSoundEnabled();
            MusicEnabled = SaveService.LoadMusicEnabled();
            ApplySettings();
            PlayBackgroundMusic();
        }

        public void PlayPlace() => PlaySfx(placeClip);
        public void PlayClear() => PlaySfx(clearClip);
        public void PlayCombo() => PlaySfx(comboClip);
        public void PlayButton() => PlaySfx(buttonClip);

        public void SetSoundEnabled(bool enabled)
        {
            SoundEnabled = enabled;
            SaveService.SaveSoundEnabled(enabled);
            ApplySettings();
        }

        public void SetMusicEnabled(bool enabled)
        {
            MusicEnabled = enabled;
            SaveService.SaveMusicEnabled(enabled);
            ApplySettings();
            PlayBackgroundMusic();
        }

        private void PlayBackgroundMusic()
        {
            if (musicSource == null || backgroundMusic == null)
            {
                return;
            }

            if (musicSource.clip != backgroundMusic)
            {
                musicSource.clip = backgroundMusic;
                musicSource.loop = true;
            }

            if (MusicEnabled && !musicSource.isPlaying)
            {
                musicSource.Play();
            }
            else if (!MusicEnabled && musicSource.isPlaying)
            {
                musicSource.Stop();
            }
        }

        private void PlaySfx(AudioClip clip)
        {
            if (!SoundEnabled || sfxSource == null || clip == null)
            {
                return;
            }

            sfxSource.PlayOneShot(clip);
        }

        private void ApplySettings()
        {
            if (musicSource != null)
            {
                musicSource.mute = !MusicEnabled;
            }

            if (sfxSource != null)
            {
                sfxSource.mute = !SoundEnabled;
            }
        }
    }
}
