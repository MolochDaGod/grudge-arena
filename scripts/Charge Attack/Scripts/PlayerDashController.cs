using UnityEngine;

public class PlayerDashController : MonoBehaviour
{
    public Player player;
    public float stopDistance;
    public string buffName;
    public Animator anim;
    private Rigidbody rb; // Reference to the Rigidbody component

    private void Start()
    {
        rb = GetComponent<Rigidbody>(); // Initialize the Rigidbody component
    }

    private void FixedUpdate()
    {
        if (player.charging)
        {
            DashMovement(buffName, stopDistance);
        }
    }

    public void DashMovement(string buffName, float stopDistance)
    {
        if (player.target != null)
        {
            Vector3 goal = player.target.transform.position;
            int index = player.skills.GetBuffIndexByName(buffName);

            player.charging = true;
            anim.SetBool("chargeattack", true);
            LockRotation(); // Lock the rotation when charging

            // Move towards the goal
            player.transform.position = Vector3.MoveTowards(player.transform.position, goal, player.speed * Time.fixedDeltaTime);
            player.transform.LookAt(goal);

            // Check if the player has reached the goal
            if (Vector3.Distance(player.transform.position, goal) <= stopDistance)
            {
                if (index != -1)
                {
                    player.skills.buffs.RemoveAt(index);
                }
                player.charging = false;
                anim.SetBool("chargeattack", false);
                UnlockRotation(); // Unlock the rotation after charging
                ForceUpright(); // Force the character to be upright
            }
        }
    }

    private void LockRotation()
    {
        rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationY | RigidbodyConstraints.FreezeRotationZ; // Lock all rotation axes
    }

    private void UnlockRotation()
    {
        rb.constraints = RigidbodyConstraints.None; // Unlock rotation (if needed)
    }

    private void ForceUpright()
    {
        // Set the character's rotation to an upright position
        player.transform.rotation = Quaternion.Euler(0, player.transform.rotation.eulerAngles.y, 0);
    }
}
