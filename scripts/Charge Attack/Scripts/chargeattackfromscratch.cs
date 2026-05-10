using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Mirror;

[CreateAssetMenu(menuName = "uMMORPG Skill/chargeattack", order = 999)]
public class chargeattackfromscratch : BuffSkill
{




    public override bool CheckTarget(Entity caster)
    {
        // target exists, alive, not self, ok type?
        return caster.target != null && caster.CanAttack(caster.target);
    }

    public override bool CheckDistance(Entity caster, int skillLevel, out Vector3 destination)
    {
        // target still around?
        if (caster.target != null)
        {
            destination = Utils.ClosestPoint(caster.target, caster.transform.position);
            return Utils.ClosestDistance(caster, caster.target) <= castRange.Get(skillLevel);
        }
        destination = caster.transform.position;
        return false;
    }



    public override void Apply(Entity caster, int skillLevel)
    {
        /*
        if (chargeattackfromscratchskilleffect != null)
        {
            GameObject go = Instantiate(chargeattackfromscratchskilleffect.gameObject, caster.skills.effectMount.position, caster.skills.effectMount.rotation);
            caster.skills.AddOrRefreshBuff(new Buff(this, skillLevel));
            chargeattackfromscratchskilleffect effect = go.GetComponent<chargeattackfromscratchskilleffect>();
            //effect.damage = damage.Get(skillLevel);
            effect.target = caster.target;
            effect.caster = caster;
            effect.isCharging = true;
            effect.buffName = name;
            //effect.stunChance = stunChance.Get(skillLevel);
           // effect.stunTime = stunTime.Get(skillLevel);
            NetworkServer.Spawn(go);
        */
        Player player = (Player)caster;
        //player.playerAnimationController.charging = true;
        player.playerDashController.buffName = name;
        
        player.charging = true;
       // player.playerDashController.buffName = name;
        caster.skills.AddOrRefreshBuff(new Buff(this, skillLevel));
        SpawnEffect(caster, caster);
        }

}