using System.Collections;
using UnityEngine;

namespace BlockPlus.Effects
{
    public enum EffectType
    {
        Place,
        Clear,
        ComboBurst,
    }

    public sealed class PooledEffect : MonoBehaviour
    {
        [SerializeField] private ParticleSystem particle;
        [SerializeField] private float fallbackDuration = 1f;

        private Coroutine playRoutine;

        public void Play(EffectPool owner, EffectType type, Vector3 position)
        {
            if (playRoutine != null)
            {
                StopCoroutine(playRoutine);
            }

            gameObject.SetActive(true);
            transform.position = position;
            playRoutine = StartCoroutine(PlayRoutine(owner, type));
        }

        private IEnumerator PlayRoutine(EffectPool owner, EffectType type)
        {
            if (particle != null)
            {
                particle.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
                particle.Play(true);
                yield return new WaitForSecondsRealtime(particle.main.duration + particle.main.startLifetime.constantMax);
            }
            else
            {
                yield return new WaitForSecondsRealtime(fallbackDuration);
            }

            owner.Return(type, this);
            playRoutine = null;
        }
    }
}
