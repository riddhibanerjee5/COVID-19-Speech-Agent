using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ChadBehaviors : MonoBehaviour
{
    Animator animator;

    AudioSource audioSource;

    // Start is called before the first frame update
    void Start()
    {
        this.animator = this.GetComponent<Animator>();
        this.audioSource = this.GetComponent<AudioSource>();
    }

    // Update is called once per frame
    void Update()
    {
        
    }

    public IEnumerator WaitForEnd(AudioClip audioClip){
        this.animator.SetBool("isSearching", false);
        this.animator.SetBool("isTalking", true);
        this.audioSource.clip = audioClip;
        this.audioSource.Play();
        yield return new WaitForSeconds(audioClip.length);
        this.animator.SetBool("isTalking", false);
    }

    public void StartSearching(){
        this.animator.SetBool("isSearching", true);
    }
}
