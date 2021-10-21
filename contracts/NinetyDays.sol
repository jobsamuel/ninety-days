//SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.4;

contract NinetyDays {
    address public admin;

    // Participant info.
    struct Challenger {
        address participant;
        uint256 valueCommitted;
        uint256 daysCommitted;
        uint256 lastCommit;
        uint256 daysLeft;
    }

    // Array of participant addresses.
    address[] private participantList;

    // Mapping from participant address to participant info.
    mapping(address => Challenger) private challengers;

    // Mapping from participant address to participation approvals.
    mapping(address => bool) private includedInChallenge;

    // Mapping from participant address to participant balances.
    mapping(address => uint256) private balances;

    bool public allowChallengeEntries = true;
    uint256 public minimumChallengeEntryPriceInWei = 1 * 10**16;
    uint256 public minimumBonusToDistributeInWei = 1 * 10**17;

    uint256 public totalFunds = 0;
    uint256 public totalBonus = 0;
    uint256 public activeParticipantCount = 0;
    uint256 public entryFee = 1;
    uint256 public exitFee = 29;

    event ChallengeEntry(
        address indexed participant,
        uint256 valueCommitted,
        uint256 daysCommitted
    );
    event ChallengeExit(
        address indexed participant,
        uint256 valueReturned,
        uint256 daysLeft
    );
    event ChallengeUpdated(
        address indexed participant,
        uint256 daysCommitted,
        uint256 daysLeft
    );
    event ChallengeFinished(
        address indexed participant,
        uint256 daysCommitted,
        uint256 daysLeft
    );
    event BonusDistributed(
        uint256 activeParticipants,
        uint256 bonusPerParticipant
    );
    event AdministrationTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );
    event Transfer(uint256 amount, address indexed from, address indexed to);
    event ChallengeAccessUpdated(bool allowChallengeEntries);

    /**
     * @dev Initializes the contract by setting a `admin` to the challenge.
     */
    constructor() {
        admin = msg.sender;
    }

    receive() external payable {}

    modifier isAdmin() {
        require(
            msg.sender == admin,
            "You are not allowed to perform this action."
        );
        _;
    }

    modifier isOpen() {
        require(allowChallengeEntries, "Challenge is closed.");
        require(
            !includedInChallenge[msg.sender],
            "You already have entered the challenge."
        );
        _;
    }

    modifier participantOnly() {
        require(includedInChallenge[msg.sender], "Participant does not exist.");
        _;
    }

    /**
     * @dev Adds `Challenger` to current participants.
     * The contract will hold funds until the desired period of time is met
     * or participant desided to withdraw from challenge.
     *
     * @param durationInDays number of desired days to participate in challenge.
     *
     * Requirements:
     *
     * - `allowChallengeEntries` must be true.
     * - `includedInChallenge` must not include msg.sender address.
     * - `minimumChallengeEntryPriceInWei` must be met or surpassed.
     *
     * Emits a {ChallengeEntry} event.
     */
    function enterChallenge(uint256 durationInDays)
        external
        payable
        isOpen
        returns (bool)
    {
        if (durationInDays > 0 && durationInDays < 90) {
            require(
                msg.value >= (minimumChallengeEntryPriceInWei * 5),
                "Minimum entry price is 0.05"
            );
        } else {
            require(
                msg.value >= minimumChallengeEntryPriceInWei,
                "Minimum entry price is 0.01"
            );
        }

        uint256 daysCommitted = durationInDays;

        // Set default duration if no number is passed in.
        if (durationInDays == 0) {
            daysCommitted = 90;
        }

        // Calculate balance and entry fee.
        (uint256 price, uint256 fee) = getValues(msg.value);

        includedInChallenge[msg.sender] = true;
        balances[msg.sender] = price;
        balances[address(this)] += fee;
        totalFunds += msg.value;
        activeParticipantCount++;

        challengers[msg.sender] = Challenger(
            msg.sender,
            price,
            daysCommitted,
            block.timestamp,
            daysCommitted
        );
        participantList.push(msg.sender);

        emit ChallengeEntry(msg.sender, price, daysCommitted);

        return true;
    }

    /**
     * @dev Forced removal of `Challenger` from current participants.
     * The contract will return part of the holded funds and it will take a percentage
     * to be distributed between active participants.
     *
     * Requirements:
     *
     * - `includedInChallenge` must include participant address.
     * - `Challenger` must have days left in challange.
     *
     * Emits {Transfer} and {ChallengeExit} events.
     */
    function exitChallenge() external payable participantOnly returns (bool) {
        require(
            challengers[msg.sender].daysLeft >= 1,
            "You already have finished the challenge."
        );

        uint256 participantBalance = balances[msg.sender];
        uint256 fee = calculateExitChallengeFee(participantBalance);
        uint256 amountToBeReturned = participantBalance - fee;

        totalFunds -= amountToBeReturned;
        totalBonus += fee;

        // Returns part of holded funds to participant.
        payable(msg.sender).transfer(amountToBeReturned);

        emit Transfer(amountToBeReturned, address(this), msg.sender);
        emit ChallengeExit(
            msg.sender,
            amountToBeReturned,
            challengers[msg.sender].daysLeft
        );

        activeParticipantCount--;

        // Participant is now excluded from challenge.
        delete includedInChallenge[msg.sender];
        delete balances[msg.sender];

        if (totalBonus >= minimumBonusToDistributeInWei) {
            distributeBonusToActiveParticipants(minimumBonusToDistributeInWei);
        }

        return true;
    }

    /**
     * @dev Subtracts a day from `Challenger` days left.
     *
     * Requirements:
     *
     * - `includedInChallenge` must include participant address.
     *
     * Emits a {ChallengeUpdated} event.
     */
    function updateDaysLeftInChallenge()
        external
        participantOnly
        returns (bool)
    {
        require(
            block.timestamp >= challengers[msg.sender].lastCommit + 86400,
            "Can not update temporally."
        );

        // Challenge can ONLY be updated between 24h AND 48h from last update.
        bool canUpdate = block.timestamp <
            challengers[msg.sender].lastCommit + 86400 * 2;

        if (challengers[msg.sender].daysLeft >= 1 && canUpdate) {
            challengers[msg.sender].daysLeft -= 1;
            challengers[msg.sender].lastCommit = block.timestamp;

            emit ChallengeUpdated(
                msg.sender,
                challengers[msg.sender].daysCommitted,
                challengers[msg.sender].daysLeft
            );
        }

        if (challengers[msg.sender].daysLeft == 0 || !canUpdate) {
            finishChallenge(msg.sender);
        }

        return true;
    }

    /**
     * @dev Removes `Challenger` from current participants.
     * Returns holded funds to participant if challange have been completed
     * if it not completed, it will take those funds to be distributed between active participants.
     *
     * @param participant address included in challenge.
     *
     * Emits a {ChallengeFinished} event.
     */
    function finishChallenge(address participant) private returns (bool) {
        uint256 participantBalance = balances[participant];

        if (challengers[participant].daysLeft < 1) {
            payable(participant).transfer(participantBalance);
            totalFunds -= participantBalance;
        } else {
            totalBonus += participantBalance;
        }

        activeParticipantCount--;

        delete includedInChallenge[participant];
        delete balances[participant];

        emit ChallengeFinished(
            participant,
            challengers[participant].daysCommitted,
            challengers[participant].daysLeft
        );

        if (totalBonus >= minimumBonusToDistributeInWei) {
            distributeBonusToActiveParticipants(minimumBonusToDistributeInWei);
        }

        return true;
    }

    /**
     * @dev Distributes `totalBonus` between active participants.
     *
     * Emits a {BonusDistributed} event.
     */
    function distributeBonusToActiveParticipants(uint256 amount)
        private
        returns (bool)
    {
        if (activeParticipantCount >= 4) {
            uint256 bonusPerParticipant = amount / activeParticipantCount;

            for (uint256 index = 0; index < participantList.length; index++) {
                address participant = participantList[index];

                /**
                 * Since `participantList` might include inactive participant addresses
                 * we need to check before add balance.
                 */
                if (includedInChallenge[participant]) {
                    balances[participant] += bonusPerParticipant;
                }
            }

            totalBonus -= amount;

            emit BonusDistributed(activeParticipantCount, bonusPerParticipant);
        }

        return true;
    }

    /**
     * @dev Override minimum bonus amount requirement
     * to distribute accumulated bonus to active participants.
     *
     * Requirements:
     *
     * - `admin` must be equal to msg.sender.
     * - `totalBonus` must be greater than zero.
     */
    function forceBonusDistribution() external isAdmin {
        require(totalBonus > 0, "Insufficient bonus balance.");

        distributeBonusToActiveParticipants(totalBonus);
    }

    /**
     * @dev Take profit from accumulated entry challange fees.
     *
     * Requirements:
     *
     * - `admin` must be equal to msg.sender.
     * - Accumulated fees must be greater than zero.
     *
     * Emits a {Transfer} event.
     */
    function takeFeesOut() external payable isAdmin {
        require(balances[address(this)] > 0, "Insufficient fees balance.");

        uint256 fees = balances[address(this)];

        payable(msg.sender).transfer(fees);
        emit Transfer(fees, address(this), msg.sender);

        balances[address(this)] = 0;
        totalFunds -= fees;
    }

    /**
     * @dev Withdraw funds that have been sent directly to contract address.
     *
     * Requirements:
     *
     * - `admin` must be equal to msg.sender.
     * - Contract balance must be greater than zero.
     *
     * Emits a {Transfer} event.
     */
    function withdraw() external payable isAdmin {
        require(address(this).balance > 0, "Insufficient contract balance.");

        uint256 contractBalance = address(this).balance;

        payable(msg.sender).transfer(contractBalance);
        emit Transfer(contractBalance, address(this), msg.sender);
    }

    /**
     * @dev Updates `allowChallengeEntries`.
     *
     * Requirements:
     *
     * - `admin` must be equal to msg.sender.
     *
     * Emits a {ChallengeAccessUpdated} event.
     */
    function updateChallengeAccess() external isAdmin {
        allowChallengeEntries = !allowChallengeEntries;

        emit ChallengeAccessUpdated(allowChallengeEntries);
    }

    /**
     * @dev Trasfers contract ownership.
     *
     * Requirements:
     *
     * - `admin` must be equal to msg.sender.
     * - `newAdmin` must be different from burn address.
     *
     * Emits a {AdministrationTransferred} event.
     */
    function transferAdministration(address newAdmin) external isAdmin {
        require(newAdmin != address(0), "Admin can not be zero address");
        emit AdministrationTransferred(admin, newAdmin);

        admin = newAdmin;
    }

    function getChallengeBalanceOf(address participant)
        external
        view
        returns (uint256)
    {
        return balances[participant];
    }

    function isIncludedInChallenge(address participant)
        external
        view
        returns (bool)
    {
        return includedInChallenge[participant];
    }

    function calculateEntryChallengeFee(uint256 amount)
        private
        view
        returns (uint256)
    {
        return (amount * entryFee) / 100;
    }

    function calculateExitChallengeFee(uint256 amount)
        private
        view
        returns (uint256)
    {
        return (amount * exitFee) / 100;
    }

    function getChallenger(address participant)
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        uint256 valueCommitted = challengers[participant].valueCommitted;
        uint256 daysCommitted = challengers[participant].daysCommitted;
        uint256 lastCommit = challengers[participant].lastCommit;
        uint256 daysLeft = challengers[participant].daysLeft;

        return (valueCommitted, daysCommitted, lastCommit, daysLeft);
    }

    function getValues(uint256 amount) private view returns (uint256, uint256) {
        uint256 fee = calculateEntryChallengeFee(amount);
        uint256 price = amount - fee;

        return (price, fee);
    }
}
